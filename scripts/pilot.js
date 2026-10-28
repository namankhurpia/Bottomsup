// Autopilot brain shared by the headless checks: follows the level's route (level.route),
// walks each player to the spot behind the raft (relative to where it wants to go) and farts
// with the ones pushing roughly the right way.
import { LEVELS } from '../src/sim/levels.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPilot(level = LEVELS.canal, { speed = 4, line = false, cosMin = 0.6 } = {}) {
  const wps = level.route;
  let w = 0;
  // spiky sliders across the route: wait in the left lane until the bar swings right, then dash
  const gates = level.movers
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.spiky && m.from.y === m.to.y)
    .map(({ m, i }) => ({ i, y: m.from.y, cx: (m.from.x + m.to.x) / 2, lane: Math.min(m.from.x, m.to.x) - 0.5, right: Math.max(m.from.x, m.to.x), dash: false }));
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
    let gate = null; // 'wait' | 'dash' while handling a spiky bar
    for (const g of gates) {
      // only when we're in the bar's own canal, just short of it
      if (s.raft.y < g.y - 8 || s.raft.y > g.y + 3.5 || Math.abs(s.raft.x - g.cx) > 7) {
        if (g.dash) {
          // made it past: carry on from the first waypoint beyond the bar, never back towards it
          const ahead = wps.findIndex(([, y]) => y > s.raft.y + 1);
          if (ahead > w) [tx, ty] = wps[(w = ahead)];
        }
        g.dash = false;
        continue;
      }
      const bar = s.movers[g.i];
      const movingRight = bar.x > (g.lastX ?? bar.x);
      g.lastX = bar.x;
      // go as soon as the bar is past the middle heading away from our lane (~3 s window)
      const ready = s.crew.every((i) => s.players[i].gas > 0.7 && !s.players[i].empty);
      if (!g.dash && ready && bar.x > -0.5 && movingRight && Math.abs(s.raft.x - g.lane) < 1.5 && s.raft.y > g.y - 5.5) g.dash = true;
      [tx, ty] = g.dash ? [g.lane, g.y + 5] : [g.lane, g.y - 4]; // wait just short of the bar
      gate = g.dash ? 'dash' : 'wait';
    }
    const dx = tx - s.raft.x, dy = ty - s.raft.y;
    const d = Math.hypot(dx, dy) || 1;
    // steer back onto the line between the previous and next waypoint (thin roads!)
    let cx = 0, cy = 0;
    if (line && w > 0 && !gate) {
      const [px, py] = wps[w - 1];
      const sx = tx - px, sy = ty - py;
      const len = Math.hypot(sx, sy) || 1;
      const off = ((s.raft.x - px) * -sy + (s.raft.y - py) * sx) / len; // signed distance from the line
      cx = (sy / len) * off * 1.5;
      cy = (-sx / len) * off * 1.5;
    }
    // dash flat out; while waiting, slow down near the wait spot (and let the tanks refill)
    const v = gate === 'dash' ? Math.max(speed, 5) : gate === 'wait' ? Math.min(speed, Math.max(0.9, d * 0.8)) : speed;
    const ex = (dx / d) * v + cx - s.raft.vx, ey = (dy / d) * v + cy - s.raft.vy;
    const want = Math.atan2(ey, ex) - s.raft.angle; // desired push, raft-local
    const go = Math.hypot(ex, ey) > 1;
    // at a spiky bar, do what a person would: park by the wall with the tanks refilling, then
    // when the bar swings away, everyone who can pushes straight ahead
    if (gate === 'wait' && d < 2.5) {
      return s.players.map((p) => ({ aim: 0, fart: false, move: Math.sign(wrap(-Math.PI / 2 - p.pos)) })); // walk to the back
    }
    if (gate === 'dash') {
      const lateral = (tx - s.raft.x) * 1.2 - s.raft.vx;
      const fwd = Math.atan2(5, lateral) - s.raft.angle;
      return s.players.map((p) => ({ aim: 0, move: 0, fart: Math.cos(wrap(fwd - (p.pos + Math.PI))) > 0.3 && !p.empty }));
    }

    // like a person would: keep some gas in reserve unless we're badly off course
    const urgent = Math.hypot(ex, ey) > 3 || gate === 'dash';
    return s.players.map((p) => {
      const err = wrap(want - (p.pos + Math.PI)); // facing the centre pushes along pos + PI
      const gasOk = p.farting ? p.gas > 0.05 : p.gas > 0.35 || urgent;
      return { aim: 0, move: Math.abs(err) > 0.05 ? Math.sign(err) : 0, fart: go && gasOk && Math.cos(err) > cosMin };
    });
  };
}
