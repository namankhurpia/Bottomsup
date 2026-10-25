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
      players     TEXT    NOT NULL,  -- JSON array of 4 names, seat order
      time_ms     INTEGER NOT NULL,
      points      INTEGER NOT NULL,
      deaths      INTEGER NOT NULL,  -- kept for fun, not used for points
      started_at  TEXT    NOT NULL,
      finished_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_level_points ON games (level, points DESC);
    CREATE INDEX IF NOT EXISTS games_finished ON games (finished_at DESC);
  `);

  const insert = db.prepare(`
    INSERT INTO games (level, room, players, time_ms, points, deaths, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const top = db.prepare(`
    SELECT id, level, room, players, time_ms, points, deaths, finished_at
    FROM games WHERE level = ? ORDER BY points DESC, finished_at ASC LIMIT ?`);
  const recent = db.prepare(`
    SELECT id, level, room, players, time_ms, points, deaths, finished_at
    FROM games ORDER BY finished_at DESC LIMIT ?`);
  const rankOf = db.prepare(`SELECT COUNT(*) AS better FROM games WHERE level = ? AND points > ?`);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM games WHERE level = ?`);

  const row = (r) => ({ ...r, players: JSON.parse(r.players) });

  return {
    saveGame(g) {
      const info = insert.run(g.level, g.room, JSON.stringify(g.players), g.timeMs, g.points, g.deaths, g.startedAt, g.finishedAt);
      const rank = rankOf.get(g.level, g.points).better + 1;
      return { id: Number(info.lastInsertRowid), rank, of: count.get(g.level).n };
    },
    leaderboard(level, limit = 20) {
      return top.all(level, limit).map(row);
    },
    recentGames(limit = 20) {
      return recent.all(limit).map(row);
    },
    close: () => db.close(),
  };
}
