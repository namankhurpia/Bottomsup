// Headless sanity check of the sim with everyone facing the centre by default.
import RAPIER from '@dimforge/rapier2d-compat';
import { arcFor, createSim, FACE_CENTER, NUM_PLAYERS } from '../src/sim/sim.js';

await RAPIER.init();

function run(farting, ticks, aim = FACE_CENTER) {
  const sim = createSim(RAPIER);
  for (let t = 0; t < ticks; t++) {
    sim.step(Array.from({ length: NUM_PLAYERS }, (_, i) => ({ aim, fart: farting.includes(i) })));
  }
  return sim.snapshot();
}

const fmt = (s) => `pos=(${s.raft.x.toFixed(2)}, ${s.raft.y.toFixed(2)}) angle=${s.raft.angle.toFixed(2)} speed=${Math.hypot(s.raft.vx, s.raft.vy).toFixed(2)}`;

const back = run([2, 3], 60);
const solo = run([2], 60);
const all = run([0, 1, 2, 3], 60);
const turned = run([2], 60, 0.8);
console.log('back pair (P3+P4), 1 s:', fmt(back));
console.log('P3 alone, 1 s         :', fmt(solo));
console.log('all four, 1 s         :', fmt(all));
console.log('P3 turned away, 1 s   :', fmt(turned));

let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); ok &&= cond; };
check(Math.abs(back.raft.angle) < 0.01 && back.raft.y > -1 && Math.abs(back.raft.x) < 0.01, 'back pair pushes straight forward');
check(Math.abs(solo.raft.angle) < 0.01 && solo.raft.x > 0.3 && solo.raft.y > -1.7, 'one player facing the centre pushes diagonally with no spin');
check(Math.hypot(all.raft.x, all.raft.y + 2) < 0.05, 'all four from their default spots cancel out');
check(Math.abs(turned.raft.angle) > 0.1, 'turning away from the centre spins the raft');
// rim slices by crew size
const deg = (r) => Math.round((r * 180) / Math.PI);
const span = (a) => deg(a.hi - a.lo);
check(arcFor(0, [0]).full && span(arcFor(0, [0])) === 360, '1 player gets the whole rim');
check([0, 2].every((i) => span(arcFor(i, [0, 2])) === 180) && arcFor(1, [0, 2]) === null, '2 players get 180 each; empty seats get none');
check([0, 1, 3].every((i) => span(arcFor(i, [0, 1, 3])) === 120), '3 players get 120 each');
check([0, 1, 2, 3].every((i) => span(arcFor(i)) === 90), '4 players keep their quarters');

// a solo player can walk all the way round (wraps), others stop at their slice edge
function walk(crew, seat, ticks) {
  const sim = createSim(RAPIER, undefined, { crew });
  for (let t = 0; t < ticks; t++) sim.step(Array.from({ length: NUM_PLAYERS }, (_, i) => ({ aim: 0, fart: false, move: i === seat ? 1 : 0 })));
  return sim.snapshot();
}
const lap = walk([0], 0, 60 * 4); // 4 s at 1.8 rad/s = more than a full lap
check(Math.abs(lap.players[0].pos) <= Math.PI + 1e-9, 'solo player walks past 360 and wraps around');
const duo = walk([0, 1], 0, 60 * 4);
check(deg(duo.players[0].pos) === deg(arcFor(0, [0, 1]).max), 'in a duo you stop at the edge of your half');

// seats outside the crew can't push
const ghost = createSim(RAPIER, undefined, { crew: [0] });
for (let t = 0; t < 60; t++) ghost.step([{ fart: false }, { aim: 0, fart: true }, { aim: 0, fart: true }, { aim: 0, fart: true }]);
const g = ghost.snapshot();
check(Math.hypot(g.raft.vx, g.raft.vy) < 1e-6 && !g.players[1].farting, 'players who are not in the crew cannot push');
process.exit(ok ? 0 : 1);
