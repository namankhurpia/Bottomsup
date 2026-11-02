// Points for finishing a level. Only time matters (splats don't count), and every player in the
// crew multiplies the score, because steering together is much harder than alone:
// alone, finishing in par time = 1000 points, twice as fast = 2000, twice as slow = 500.
// The same run scores 2000 with two players, 3000 with three and 4000 with four.
export function pointsFor(level, timeMs, crewSize = 1) {
  if (!level.par || !(timeMs > 0)) return 0;
  return Math.round((1000 * level.par * 1000) / timeMs) * crewSize;
}
