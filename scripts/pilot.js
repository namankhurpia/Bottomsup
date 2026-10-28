// Autopilot brain shared by the headless checks: follows the level's route (level.route),
// walks each player to the spot behind the raft (relative to where it wants to go) and farts
// with the ones pushing roughly the right way.
import { LEVELS } from '../src/sim/levels.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPilot(level = LEVELS.canal, { speed = 4, line = false, cosMin = 0.6 } = {}) {
  const wps = level.route;
  let w = 0;
  return function commands(s, events = []) {
    if (events.some((e) => e.type === 'respawned')) {
      // back at a checkpoint: carry on from the nearest waypoint ahead
      let best = 0;
      wps.forEach(([x, y], i) => {
        if (Math.hypot(x - s.raft.x, y - s.raft.y) < Math.hypot(wps[best][0] - s.raft.x, wps[best][1] - s.raft.y)) best = i;
      });
      w = Math.min(best + 1, wps.length - 1);
    }
    let [tx, ty] = wps[w];
    if (Math.hypot(tx - s.raft.x, ty - s.raft.y) < 2.5 && w < wps.length - 1) [tx, ty] = wps[++w];
    const dx = tx - s.raft.x, dy = ty - s.raft.y;
    const d = Math.hypot(dx, dy) || 1;
    // steer back onto the line between the previous and next waypoint (thin roads!)
    let cx = 0, cy = 0;
    if (line && w > 0) {
      const [px, py] = wps[w - 1];
      const sx = tx - px, sy = ty - py;
      const len = Math.hypot(sx, sy) || 1;
      const off = ((s.raft.x - px) * -sy + (s.raft.y - py) * sx) / len; // signed distance from the line
      cx = (sy / len) * off * 1.5;
      cy = (-sx / len) * off * 1.5;
    }
    const ex = (dx / d) * speed + cx - s.raft.vx, ey = (dy / d) * speed + cy - s.raft.vy;
    const want = Math.atan2(ey, ex) - s.raft.angle; // desired push, raft-local
    const go = Math.hypot(ex, ey) > 1;
    // like a person would: keep some gas in reserve unless we're badly off course
    const urgent = Math.hypot(ex, ey) > 3;
    return s.players.map((p) => {
      const err = wrap(want - (p.pos + Math.PI)); // facing the centre pushes along pos + PI
      const gasOk = p.farting ? p.gas > 0.05 : p.gas > 0.35 || urgent;
      return { aim: 0, move: Math.abs(err) > 0.05 ? Math.sign(err) : 0, fart: go && gasOk && Math.cos(err) > cosMin };
    });
  };
}
