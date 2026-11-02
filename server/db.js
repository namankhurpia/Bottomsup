// Score storage: Node's built-in SQLite (no native modules to build on the server).
// Every finished race is kept forever. Times are stored as UTC ISO strings; clients
// show them in their own local time.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS } from '../src/sim/levels.js';

const today = () => new Date().toISOString().slice(0, 10); // UTC
const sha256 = (text) => createHash('sha256').update(text).digest();
const VISITS_KEPT_DAYS = 90; // the privacy policy promises this
const MAX_VISITS_PER_DAY = 20_000; // so nobody can fill the disk by making up browsers

// Analytics must never get in the way of the game: if one of these fails, it's only logged.
const quiet = (fn) => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    console.error('analytics:', err.message);
  }
};

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'scores.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       TEXT    NOT NULL,
      room        TEXT    NOT NULL,
      players     TEXT    NOT NULL,  -- JSON array of the crew's names, seat order
      time_ms     INTEGER NOT NULL,
      points      INTEGER NOT NULL,
      deaths      INTEGER NOT NULL,  -- kept for fun, not used for points
      started_at  TEXT    NOT NULL,
      finished_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_finished ON games (finished_at DESC);
  `);
  // v2: crews of 1-4 players, each with their own leaderboard. Older games were all 4-player.
  const cols = db.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
  if (!cols.includes('crew_size')) db.exec('ALTER TABLE games ADD COLUMN crew_size INTEGER NOT NULL DEFAULT 4');
  db.exec('DROP INDEX IF EXISTS games_level_points');
  db.exec('CREATE INDEX IF NOT EXISTS games_board ON games (level, crew_size, points DESC)');

  // Rough site analytics. Raw IPs are never stored: a visitor is only a salted hash, per day.
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, peak INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, hash)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS visitors_hash ON visitors (hash);
  `);
  // Private stats, for /stats. One row per visitor per day, deleted after VISITS_KEPT_DAYS; level
  // numbers are plain counts with nothing about who played.
  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      day TEXT NOT NULL, hash TEXT NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
      city TEXT, region TEXT, country TEXT, device TEXT, os TEXT, browser TEXT, referrer TEXT,
      names TEXT NOT NULL DEFAULT '[]', rooms INTEGER NOT NULL DEFAULT 0,
      races_started INTEGER NOT NULL DEFAULT 0, races_finished INTEGER NOT NULL DEFAULT 0, falls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, hash)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS visits_last ON visits (last_at DESC);
    CREATE TABLE IF NOT EXISTS level_daily (
      day TEXT NOT NULL, level TEXT NOT NULL, crew INTEGER NOT NULL,
      started INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, quit INTEGER NOT NULL DEFAULT 0, falls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, level, crew)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS falls (
      level TEXT NOT NULL, section INTEGER NOT NULL, cause TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (level, section, cause)
    ) WITHOUT ROWID;
  `);
  // Points now multiply by crew size. Races saved before that get the same treatment, once.
  if (!db.prepare(`SELECT 1 FROM meta WHERE key = 'points_by_crew'`).get()) {
    db.exec(`
      BEGIN;
      UPDATE games SET points = points * crew_size;
      INSERT INTO meta (key, value) VALUES ('points_by_crew', '1');
      COMMIT;
    `);
  }
  db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('visitor_salt', ?)`).run(randomBytes(16).toString('hex'));
  const salt = db.prepare(`SELECT value FROM meta WHERE key = 'visitor_salt'`).get().value;
  db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('stats_key', ?)`).run(randomBytes(16).toString('hex'));
  const statsKey = db.prepare(`SELECT value FROM meta WHERE key = 'stats_key'`).get().value;
  const hashVisitor = (ip, userAgent) => createHash('sha256').update(`${salt}|${ip}|${userAgent}`).digest('hex').slice(0, 32);
  const addView = db.prepare(`INSERT INTO daily (day, views) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET views = views + 1`);
  const addVisitor = db.prepare(`INSERT OR IGNORE INTO visitors (day, hash) VALUES (?, ?)`);
  const setPeak = db.prepare(`INSERT INTO daily (day, peak) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET peak = MAX(peak, excluded.peak)`);
  const viewTotals = db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(MAX(peak), 0) AS peak FROM daily`);
  const allVisitors = db.prepare(`SELECT COUNT(DISTINCT hash) AS n FROM visitors`);
  const lastDays = db.prepare(`
    SELECT d.day, d.views, d.peak,
      (SELECT COUNT(*) FROM visitors v WHERE v.day = d.day) AS visitors,
      (SELECT COUNT(*) FROM games g WHERE substr(g.finished_at, 1, 10) = d.day) AS races
    FROM daily d ORDER BY d.day DESC LIMIT ?`);
  const namedPlayers = db.prepare(`SELECT COUNT(DISTINCT lower(p.value)) AS n FROM games g, json_each(g.players) p`);

  const insert = db.prepare(`
    INSERT INTO games (level, room, players, crew_size, time_ms, points, deaths, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const top = db.prepare(`
    SELECT id, level, room, players, crew_size, time_ms, points, deaths, finished_at
    FROM games WHERE level = ? AND crew_size = ? ORDER BY points DESC, finished_at ASC LIMIT ?`);
  const recent = db.prepare(`
    SELECT id, level, room, players, crew_size, time_ms, points, deaths, finished_at
    FROM games ORDER BY finished_at DESC LIMIT ?`);
  const rankOf = db.prepare(`SELECT COUNT(*) AS better FROM games WHERE level = ? AND crew_size = ? AND points > ?`);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM games WHERE level = ? AND crew_size = ?`);

  // progress: a player's name appears in the players JSON of every race they finished
  const cleared = db.prepare(`
    SELECT g.level, MIN(g.time_ms) AS best_ms, MAX(g.points) AS best_points, COUNT(*) AS races
    FROM games g, json_each(g.players) p WHERE lower(p.value) = lower(?) GROUP BY g.level`);
  const totals = db.prepare(`SELECT COUNT(*) AS n FROM games`);
  // the furthest level always ranks first, however slowly it was finished; points only decide within a level
  const levelRank = Object.values(LEVELS).filter((l) => l.number).map((l) => `WHEN '${l.id}' THEN ${l.number}`).join(' ');
  const topRaces = db.prepare(`
    SELECT id, level, room, players, crew_size, time_ms, points, deaths, finished_at
    FROM games ORDER BY CASE level ${levelRank} ELSE 0 END DESC, points DESC, finished_at ASC LIMIT ?`);

  const row = (r) => ({ ...r, players: JSON.parse(r.players) });

  const visitKnown = db.prepare(`SELECT 1 FROM visits WHERE day = ? AND hash = ?`);
  const visitsOn = db.prepare(`SELECT COUNT(*) AS n FROM visits WHERE day = ?`);
  const newVisit = db.prepare(`
    INSERT INTO visits (day, hash, first_at, last_at, city, region, country, device, os, browser, referrer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const touchVisit = db.prepare(`UPDATE visits SET last_at = ?, views = views + ? WHERE day = ? AND hash = ?`);
  const addSeconds = db.prepare(`UPDATE visits SET seconds = seconds + ? WHERE day = ? AND hash = ?`);
  const namesOf = db.prepare(`SELECT names FROM visits WHERE day = ? AND hash = ?`);
  const joinVisit = db.prepare(`UPDATE visits SET names = ?, rooms = rooms + ? WHERE day = ? AND hash = ?`);
  const bumpVisit = (col) => db.prepare(`UPDATE visits SET ${col} = ${col} + 1 WHERE day = ? AND hash = ?`);
  const visitStarted = bumpVisit('races_started');
  const visitFinished = bumpVisit('races_finished');
  const visitFell = bumpVisit('falls');
  const bumpLevel = (col) => db.prepare(`
    INSERT INTO level_daily (day, level, crew, ${col}) VALUES (?, ?, ?, 1)
    ON CONFLICT (day, level, crew) DO UPDATE SET ${col} = ${col} + 1`);
  const levelStarted = bumpLevel('started');
  const levelFinished = bumpLevel('finished');
  const levelQuit = bumpLevel('quit');
  const levelFell = bumpLevel('falls');
  const addFall = db.prepare(`
    INSERT INTO falls (level, section, cause, n) VALUES (?, ?, ?, 1)
    ON CONFLICT (level, section, cause) DO UPDATE SET n = n + 1`);
  const purgeVisits = db.prepare(`DELETE FROM visits WHERE day < ?`);
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  const visitorsSince = db.prepare(`SELECT COUNT(DISTINCT hash) AS n, COALESCE(SUM(seconds), 0) AS seconds FROM visits WHERE day >= ?`);
  const recentVisits = db.prepare(`
    SELECT first_at, last_at, views, seconds, city, region, country, device, os, browser, referrer, names, rooms, races_started, races_finished, falls
    FROM visits ORDER BY last_at DESC LIMIT ?`);
  const topBy = (col) => db.prepare(`
    SELECT ${col} AS label, COUNT(DISTINCT hash) AS n FROM visits
    WHERE day >= ? AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC, label LIMIT 10`);
  const topCountries = topBy('country');
  const topCities = db.prepare(`
    SELECT city || ', ' || COALESCE(country, '?') AS label, COUNT(DISTINCT hash) AS n FROM visits
    WHERE day >= ? AND city IS NOT NULL GROUP BY city, country ORDER BY n DESC, label LIMIT 10`);
  const topDevices = topBy('device');
  const topBrowsers = topBy('browser');
  const topReferrers = topBy('referrer');
  const levelTotals = db.prepare(`
    SELECT level, SUM(started) AS started, SUM(finished) AS finished, SUM(quit) AS quit, SUM(falls) AS falls
    FROM level_daily GROUP BY level`);
  const fallSpots = db.prepare(`SELECT level, section, cause, n FROM falls ORDER BY n DESC LIMIT 40`);
  const levelInfo = (id) => (LEVELS[id] ? { name: LEVELS[id].name, number: LEVELS[id].number } : { name: id, number: 0 });

  return {
    saveGame(g) {
      const info = insert.run(g.level, g.room, JSON.stringify(g.players), g.crewSize, g.timeMs, g.points, g.deaths, g.startedAt, g.finishedAt);
      const rank = rankOf.get(g.level, g.crewSize, g.points).better + 1;
      return { id: Number(info.lastInsertRowid), rank, of: count.get(g.level, g.crewSize).n };
    },
    // one board per crew size: solo runs and 4-player runs aren't comparable
    leaderboard(level, crewSize = 4, limit = 20) {
      return top.all(level, crewSize, limit).map(row);
    },
    recentGames(limit = 20) {
      return recent.all(limit).map(row);
    },
    // { levelId: { best_ms, best_points, races } } for every level this name has finished
    progress(name) {
      const out = {};
      if (name) for (const r of cleared.all(name)) out[r.level] = { best_ms: r.best_ms, best_points: r.best_points, races: r.races };
      return out;
    },
    // how many races have been run, and the best ones: furthest level first, then most points
    history(limit = 10) {
      return { total: totals.get().n, games: topRaces.all(limit).map(row) };
    },
    recordVisit(ip, userAgent, day = today()) {
      addView.run(day);
      addVisitor.run(day, hashVisitor(ip, userAgent));
    },
    hashVisitor,
    // describe() is only called for someone new today, so the location is looked up once a day
    seeVisitor: quiet((hash, describe, view = false, day = today()) => {
      const now = new Date().toISOString();
      if (!visitKnown.get(day, hash)) {
        if (visitsOn.get(day).n >= MAX_VISITS_PER_DAY) return;
        const v = describe();
        newVisit.run(day, hash, now, now, v.city ?? null, v.region ?? null, v.country ?? null, v.device, v.os, v.browser, v.referrer ?? null);
      }
      touchVisit.run(now, view ? 1 : 0, day, hash);
    }),
    addVisitSeconds: quiet((hash, seconds, day = today()) => addSeconds.run(Math.round(seconds), day, hash)),
    visitorJoined: quiet((hash, name, isPrivate, day = today()) => {
      const r = hash && namesOf.get(day, hash);
      if (!r) return;
      const names = JSON.parse(r.names);
      if (!names.includes(name) && names.length < 8) names.push(name);
      joinVisit.run(JSON.stringify(names), isPrivate ? 0 : 1, day, hash);
    }),
    raceStarted: quiet((level, crew, visitors, day = today()) => {
      levelStarted.run(day, level, crew);
      for (const h of visitors) visitStarted.run(day, h);
    }),
    raceFinished: quiet((level, crew, visitors, day = today()) => {
      levelFinished.run(day, level, crew);
      for (const h of visitors) visitFinished.run(day, h);
    }),
    raceQuit: quiet((level, crew, day = today()) => levelQuit.run(day, level, crew)),
    raftFell: quiet((level, crew, section, cause, visitors, day = today()) => {
      levelFell.run(day, level, crew);
      addFall.run(level, section, cause);
      for (const h of visitors) visitFell.run(day, h);
    }),
    purgeOldVisits: quiet(() => purgeVisits.run(daysAgo(VISITS_KEPT_DAYS))),
    statsKey,
    checkStatsKey: (key) => timingSafeEqual(sha256(String(key)), sha256(statsKey)),
    stats(limit = 200) {
      const month = daysAgo(29);
      const since = (d) => visitorsSince.get(d);
      const counts = (q) => q.all(month).map((r) => ({ ...r }));
      return {
        visitors: { today: since(today()).n, week: since(daysAgo(6)).n, month: since(month).n },
        secondsThisMonth: since(month).seconds,
        visits: recentVisits.all(limit).map((r) => ({ ...r, names: JSON.parse(r.names) })),
        top: {
          countries: counts(topCountries), cities: counts(topCities), devices: counts(topDevices),
          browsers: counts(topBrowsers), referrers: counts(topReferrers),
        },
        levels: levelTotals.all().map((r) => ({ ...r, ...levelInfo(r.level) })).sort((a, b) => a.number - b.number),
        falls: fallSpots.all().map((r) => ({ ...r, ...levelInfo(r.level) })),
      };
    },
    recordPeak: (online, day = today()) => setPeak.run(day, online),
    analytics(days = 14) {
      const t = viewTotals.get();
      return {
        totalViews: t.views,
        totalVisitors: allVisitors.get().n,
        peakEver: t.peak,
        totalRaces: totals.get().n,
        totalPlayers: namedPlayers.get().n,
        days: lastDays.all(days).map((r) => ({ ...r })),
      };
    },
    close: () => db.close(),
  };
}
