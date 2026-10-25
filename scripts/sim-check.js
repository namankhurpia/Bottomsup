// Headless sanity check of the sim with everyone facing the centre by default.
import RAPIER from '@dimforge/rapier2d-compat';
import { createSim, FACE_CENTER, NUM_PLAYERS } from '../src/sim/sim.js';

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
process.exit(ok ? 0 : 1);
