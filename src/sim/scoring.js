// Points for finishing a level. Only time matters (splats don't count):
// finishing in par time = 1000 points, twice as fast = 2000, twice as slow = 500.
export function pointsFor(level, timeMs) {
  if (!level.par || !(timeMs > 0)) return 0;
  return Math.round((1000 * level.par * 1000) / timeMs);
}
