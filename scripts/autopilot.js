// Drives level 1 headlessly with the shared pilot: checks the level is beatable and the
// checkpoint/finish sensors fire.
import RAPIER from '@dimforge/rapier2d-compat';
import { createSim } from '../src/sim/sim.js';
import { createPilot } from './pilot.js';

await RAPIER.init();
const sim = createSim(RAPIER);
const pilot = createPilot();
const log = [];
let events = [];
for (let t = 0; t < 60 * 240; t++) {
  const s = sim.snapshot();
  if (s.phase === 'finished') break;
  events = sim.step(pilot(s, events));
  for (const e of events) if (!e.type.startsWith('fart') && e.type !== 'empty') log.push(`${(t / 60).toFixed(1)}s ${e.type}${e.index ?? ''} @ (${s.raft.x.toFixed(1)}, ${s.raft.y.toFixed(1)})`);
}
const s = sim.snapshot();
console.log(log.join('\n'));
console.log('final', s.phase, 'time', (s.timeTicks / 60).toFixed(1), 's', 'deaths', s.deaths, 'pos', s.raft.x.toFixed(1), s.raft.y.toFixed(1));
process.exit(s.phase === 'finished' ? 0 : 1);
