// Score storage: Node's built-in SQLite (no native modules to build on the server).
// Every finished race is kept forever. Times are stored as UTC ISO strings; clients
// show them in their own local time.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

  // progress and history: a player's name appears in the players JSON of every race they finished
  const cleared = db.prepare(`
    SELECT g.level, MIN(g.time_ms) AS best_ms, MAX(g.points) AS best_points, COUNT(*) AS races
    FROM games g, json_each(g.players) p WHERE lower(p.value) = lower(?) GROUP BY g.level`);
  const totals = db.prepare(`SELECT COUNT(*) AS n FROM games`);
  const byLevel = db.prepare(`SELECT level, COUNT(*) AS n FROM games GROUP BY level`);
  const byCrew = db.prepare(`SELECT crew_size, COUNT(*) AS n FROM games GROUP BY crew_size`);
  const mineCount = db.prepare(`SELECT COUNT(*) AS n FROM games g, json_each(g.players) p WHERE lower(p.value) = lower(?)`);
  const mineRecent = db.prepare(`
    SELECT g.id, g.level, g.room, g.players, g.crew_size, g.time_ms, g.points, g.deaths, g.finished_at
    FROM games g, json_each(g.players) p WHERE lower(p.value) = lower(?) ORDER BY g.finished_at DESC LIMIT ?`);

  const row = (r) => ({ ...r, players: JSON.parse(r.players) });

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
    history(name, limit = 50) {
      const count = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.n]));
      return {
        total: totals.get().n,
        byLevel: count(byLevel.all(), 'level'),
        byCrew: count(byCrew.all(), 'crew_size'),
        mine: name ? mineCount.get(name).n : null,
        games: (name ? mineRecent.all(name, limit) : recent.all(limit)).map(row),
      };
    },
    close: () => db.close(),
  };
}
