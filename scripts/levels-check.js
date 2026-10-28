// Every race level must be beatable by every crew size (1-4), or players get locked out of
// the levels after it. Tries each autopilot style until one finishes. Slow: a few minutes.
import RAPIER from '@dimforge/rapier2d-compat';
import { LEVELS, RACE_LEVELS } from '../src/sim/levels.js';
import { STYLES, drive } from './autopilot.js';

await RAPIER.init();
let failures = 0;
for (const id of RACE_LEVELS) {
  for (const crew of [1, 2, 3, 4]) {
    const r = STYLES.map((style) => ({ style, ...drive(RAPIER, LEVELS[id], crew, style) })).find((x) => x.finished);
    console.log(r ? `PASS ${id} crew ${crew}: ${r.seconds.toFixed(1)} s, ${r.deaths} deaths [${r.style.name}]` : `FAIL ${id} crew ${crew}: no style finished`);
    if (!r) failures++;
  }
}
process.exit(failures ? 1 : 0);
