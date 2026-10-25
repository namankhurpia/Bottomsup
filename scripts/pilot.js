// Autopilot brain shared by the headless checks: walks each player to the spot behind the raft
// (relative to where it wants to go) and farts with the ones pushing roughly the right way.
const WAYPOINTS = [[0, 14], [0, 24], [0, 30], [0, 42], [8, 46.25], [17, 46.25], [30, 50], [44, 50], [57, 46.25]];
const RESUME_AT = [0, 2, 5]; // first waypoint after each checkpoint
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPilot() {
  let w = 0;
  return function commands(s, events = []) {
    if (events.some((e) => e.type === 'respawned')) w = RESUME_AT[s.checkpoint];
    const [tx, ty] = WAYPOINTS[w];
    const dx = tx - s.raft.x, dy = ty - s.raft.y;
    if (Math.hypot(dx, dy) < 2.5 && w < WAYPOINTS.length - 1) w++;
    const d = Math.hypot(dx, dy) || 1;
    const ex = (dx / d) * 4 - s.raft.vx, ey = (dy / d) * 4 - s.raft.vy;
    const want = Math.atan2(ey, ex) - s.raft.angle; // desired push, raft-local
    const go = Math.hypot(ex, ey) > 1;
    return s.players.map((p) => {
      const err = wrap(want - (p.pos + Math.PI)); // facing the centre pushes along pos + PI
      return { aim: 0, move: Math.abs(err) > 0.05 ? Math.sign(err) : 0, fart: go && Math.cos(err) > 0.6 };
    });
  };
}
