// Level 1: "The Bendy Canal".
// Sim coordinates: x = right, y = forward (top-down 2D). All rects are { x, y, w, h }
// with (x, y) the centre and w/h full sizes. The renderer maps sim (x, y) -> three (x, -y).
//
// Layout: a straight canal north (narrow gap, sliding log), a sharp right turn with
// spikes on the outer corner, then a canal east (spinning log, current that drags you
// onto spikes, a bobbing gate) to the finish.

export const LEVEL = {
  id: 'canal',
  number: 1,
  name: 'The Bendy Canal',
  par: 75, // seconds; finishing in par time scores 1000 points

  walls: [
    { x: 0, y: -6, w: 14, h: 1 },            // back wall behind the start
    { x: -6.5, y: 23.25, w: 1, h: 58.5 },    // west bank
    { x: 6.5, y: 17.25, w: 1, h: 46.5 },     // east bank (ends at the turn)
    { x: 26.75, y: 52.5, w: 67.5, h: 1 },    // north bank (outer side of the turn + east canal)
    { x: 33.25, y: 40, w: 54.5, h: 1 },      // south bank of the east canal
    { x: 60.5, y: 46.25, w: 1, h: 13.5 },    // end wall
    // narrow gap: 4 m opening, the raft is 3 m wide (4.2 m corner to corner)
    { x: -4, y: 20, w: 4, h: 1.5 },
    { x: 4, y: 20, w: 4, h: 1.5 },
  ],

  // Touching any of these sends you back to the last checkpoint.
  spikes: [
    { x: 0, y: 51.75, w: 12, h: 0.5 },       // outer corner, north side
    { x: -5.75, y: 47, w: 0.5, h: 9 },       // outer corner, west side
    { x: 38, y: 40.75, w: 12, h: 0.5 },      // under the current
  ],

  // Respawn points. zone = the sensor that unlocks it (index 0 is the start).
  // angle: raft rotation; 0 faces +y (north), -PI/2 faces +x (east).
  checkpoints: [
    { x: 0, y: -2, angle: 0, zone: null },
    { x: 0, y: 26, angle: 0, zone: { x: 0, y: 26, w: 12, h: 3 } },
    { x: 13, y: 46.25, angle: -Math.PI / 2, zone: { x: 13, y: 46.25, w: 3, h: 11.5 } },
  ],

  finish: { x: 55.5, y: 46.25, w: 3, h: 11.5 },

  // Moving obstacles (kinematic). Poses are a pure function of time, so they are deterministic.
  movers: [
    { type: 'slider', w: 4, h: 1, from: { x: -3.5, y: 32 }, to: { x: 3.5, y: 32 }, period: 4.5 },
    { type: 'rotor', w: 7.5, h: 0.8, x: 24, y: 46.25, speed: 1.1 },
    { type: 'slider', w: 1, h: 4.5, from: { x: 49, y: 43.5 }, to: { x: 49, y: 49.25 }, period: 3.2 },
  ],

  // Water currents: acceleration (m/s^2) applied while the raft centre is inside.
  currents: [
    { x: 38, y: 46.25, w: 12, h: 11.5, ax: 0, ay: -2.0 },
  ],

  // Visual only: where the canal water is (used for the camera bounds and decorations).
  bounds: { minX: -8, maxX: 62, minY: -8, maxY: 54 },
};
