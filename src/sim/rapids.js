// Level 3: "Rapids Run". The long one: walled canals with strong currents in every corner
// (they shove you outward onto spikes, and one person alone can barely push against them),
// then a long unprotected road over the drop, then two more canals to the finish.
//
// Layout (sim coords, y = north):
//   1. canal north (x -6..6), sliding log + spinning log
//   2. corner A: current shoves north onto spikes, turn east
//   3. canal east (y 60..72), spinning log + bobbing gate
//   4. corner B: current shoves east onto spikes, turn south onto...
//   5. the long thin road south over the drop, with a crosswind
//   6. pool E, then canal west with a gate and a spinning log
//   7. corner C: current shoves west onto spikes, turn north
//   8. final straight to the finish

import { route } from './route.js';

const CORNER = 3.0; // m/s^2 in the corners: one farter can beat it, two make it easy

export const RAPIDS = {
  id: 'rapids',
  number: 3,
  name: 'Rapids Run',
  blurb: 'The long one. Raging corners that take two to fight, then a thin road over the drop.',
  par: 180, // seconds for 1000 points (scaled from level 1 by the best autopilot time)

  water: [
    { x: 0, y: 33, w: 12, h: 78 },          // canal north + corner A   (y -6 .. 72)
    { x: 43.75, y: 66, w: 76.5, h: 12 },    // canal east + corner B    (x 5.5 .. 82)
    { x: 76, y: 58.5, w: 8, h: 5 },         // a little funnel into the road (y 56 .. 61)
    { x: 76, y: 37.5, w: 3.5, h: 46 },      // the thin road south      (y 14.5 .. 60.5)
    { x: 76, y: 8.5, w: 20, h: 13 },        // pool E                   (y 2 .. 15)
    { x: 37.25, y: 8, w: 58.5, h: 12 },     // canal west + corner C    (x 8 .. 66.5)
    { x: 14, y: 27.75, w: 12, h: 28.5 },    // final straight           (y 13.5 .. 42)
  ],

  walls: [
    { x: 0, y: -6.5, w: 14, h: 1 },          // behind the start
    { x: -6.5, y: 33, w: 1, h: 80 },         // canal north, west bank (+ corner A)
    { x: 6.5, y: 26.75, w: 1, h: 67.5 },     // canal north, east bank (y -7 .. 60.5)
    { x: 38, y: 72.5, w: 90, h: 1 },         // north bank of corner A + canal east + corner B
    { x: 38.25, y: 59.5, w: 63.5, h: 1 },    // canal east, south bank (x 6.5 .. 70)
    { x: 82.5, y: 66, w: 1, h: 14 },         // corner B, east bank
    { x: 43.25, y: 14.5, w: 45.5, h: 1 },    // canal west, north bank (x 20.5 .. 66; the final straight opens west of it)
    { x: 36.75, y: 1.5, w: 59.5, h: 1 },     // canal west, south bank (x 7 .. 66.5)
    { x: 7.5, y: 22, w: 1, h: 42 },          // corner C + final straight, west bank
    { x: 20.5, y: 28.5, w: 1, h: 28 },       // final straight, east bank (y 14.5 .. 42.5)
    { x: 14, y: 42.5, w: 14, h: 1 },         // end wall
  ],

  // the outside of every raging corner
  spikes: [
    { x: 0, y: 71.75, w: 12, h: 0.5 },       // corner A
    { x: 81.75, y: 66, w: 0.5, h: 11 },      // corner B
    { x: 8.25, y: 8, w: 0.5, h: 11 },        // corner C
  ],

  checkpoints: [
    { x: 0, y: -2, angle: 0, zone: null },
    { x: 0, y: 50, angle: 0, zone: { x: 0, y: 50, w: 12, h: 3 } },
    { x: 60, y: 66, angle: -Math.PI / 2, zone: { x: 60, y: 66, w: 3, h: 12 } },
    { x: 76, y: 8.5, angle: Math.PI / 2, zone: { x: 76, y: 8.5, w: 19, h: 12 } },
    { x: 14, y: 22, angle: 0, zone: { x: 14, y: 22, w: 12, h: 3 } },
  ],
  finish: { x: 14, y: 38, w: 12, h: 3 },

  movers: [
    { type: 'slider', w: 3.2, h: 1, from: { x: -3.5, y: 20 }, to: { x: 3.5, y: 20 }, period: 6, spiky: true }, // touch it and you splat; slip past by the wall it's swinging away from
    { type: 'rotor', w: 7, h: 0.8, x: 0, y: 38, speed: 1.0 },
    { type: 'rotor', w: 6.4, h: 0.8, x: 28, y: 66, speed: 0.9 }, // wait for it to lie along the canal
    { type: 'slider', w: 1, h: 4.5, from: { x: 46, y: 62.5 }, to: { x: 46, y: 69.5 }, period: 3.6 },
    { type: 'slider', w: 1, h: 4, from: { x: 52, y: 4 }, to: { x: 52, y: 12 }, period: 4 },
    { type: 'rotor', w: 7, h: 0.8, x: 32, y: 8, speed: 1.1 },
  ],

  currents: [
    { x: 0, y: 66, w: 12, h: 12, ax: 0, ay: CORNER },     // corner A shoves north
    { x: 76, y: 67, w: 12, h: 10, ax: CORNER, ay: 0 },    // corner B shoves east (stops 2 m before the road)
    { x: 76, y: 38, w: 3.5, h: 30, ax: -0.9, ay: 0 },     // crosswind on the thin road
    { x: 14, y: 8, w: 12, h: 12, ax: -CORNER, ay: 0 },    // corner C shoves west
  ],

  bounds: { minX: -8, maxX: 88, minY: -8, maxY: 74 },

  route: route([
    [0, -2], [0, 58], [3, 65], [10, 66], [70, 66], [76, 63], [76, 60], [76, 15], [76, 9],
    [66, 8], [20, 8], [14, 11], [14, 16], [14, 38],
  ]),
};
