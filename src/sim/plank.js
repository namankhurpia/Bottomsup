// Level 2: "The Plank Road". A raised water channel over a drop, with no walls at all.
// Thin roads (3.5 m; the raft is 3.4 m across) link wider pools. Let the raft's centre
// drift off the water and you fall. A crosswind current on the long east road and a
// sweeping gate on the south road make it harder.
//
// Layout: start pool -> thin road north -> pool B -> thin road east (crosswind) -> pool C
// -> thin road south (sweeping gate) -> finish pool D.

import { route } from './route.js';

export const PLANK = {
  id: 'plank',
  number: 2,
  name: 'The Plank Road',
  blurb: 'No walls. Thin roads over a long drop, a crosswind and a sweeping gate. Stay on the water!',
  par: 70, // seconds for 1000 points (scaled from level 1 by the best autopilot time)

  // Safe water: if the raft's centre is outside all of these, it falls. Pieces overlap 0.5 m.
  water: [
    { x: 0, y: 1.75, w: 10, h: 13.5 },   // start pool    (y -5 .. 8.5)
    { x: 0, y: 24.25, w: 3.5, h: 32.5 }, // road north    (y 8 .. 40.5)
    { x: 0, y: 46, w: 12, h: 12 },       // pool B        (y 40 .. 52)
    { x: 23, y: 46, w: 35, h: 3.5 },     // road east     (x 5.5 .. 40.5)
    { x: 46, y: 46, w: 12, h: 16 },      // pool C        (y 38 .. 54)
    { x: 46, y: 24, w: 3.5, h: 29 },     // road south    (y 9.5 .. 38.5)
    { x: 46, y: 4, w: 12, h: 12 },       // finish pool D (y -2 .. 10)
  ],
  walls: [],
  spikes: [],

  checkpoints: [
    { x: 0, y: 0, angle: 0, zone: null },
    { x: 0, y: 46, angle: -Math.PI / 2, zone: { x: 0, y: 46, w: 11, h: 11 } },
    { x: 46, y: 46, angle: Math.PI, zone: { x: 46, y: 46, w: 11, h: 15 } },
  ],
  finish: { x: 46, y: 2, w: 11, h: 3 },

  movers: [
    // a gate that sweeps across the south road
    { type: 'slider', w: 2.6, h: 0.8, from: { x: 41.5, y: 24 }, to: { x: 50.5, y: 24 }, period: 5 },
  ],

  // a steady crosswind on the east road, pushing you off its south edge
  currents: [{ x: 23, y: 46, w: 30, h: 3.5, ax: 0, ay: -1.1 }],

  bounds: { minX: -6, maxX: 52, minY: -5, maxY: 54 },

  route: route([[0, 0], [0, 40], [0, 46], [6, 46], [40, 46], [46, 46], [46, 38], [46, 9], [46, 2]]),
};
