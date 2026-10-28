// Level unlocking: level 1 is always open; finishing a level opens the next one.
// `cleared` is a set (or array) of level ids someone has finished.
import { RACE_LEVELS } from './levels.js';

export function unlockedLevels(cleared) {
  const done = new Set(cleared);
  return RACE_LEVELS.filter((id, i) => i === 0 || done.has(RACE_LEVELS[i - 1]));
}
