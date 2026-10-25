// The lobby: a small practice pond to paddle around in while waiting for the crew.
// No spikes, no finish, no clock. Just a few things to bump into.

export const POND = {
  id: 'pond',
  name: 'Practice Pond',
  walls: [
    { x: 0, y: -10.5, w: 26, h: 1 },
    { x: 0, y: 14.5, w: 26, h: 1 },
    { x: -12.5, y: 2, w: 1, h: 26 },
    { x: 12.5, y: 2, w: 1, h: 26 },
    // a few pilings to practise steering around
    { x: -6, y: 6, w: 1.2, h: 1.2 },
    { x: 6, y: 6, w: 1.2, h: 1.2 },
    { x: -6, y: -4, w: 1.2, h: 1.2 },
    { x: 6, y: -4, w: 1.2, h: 1.2 },
  ],
  spikes: [],
  checkpoints: [{ x: 0, y: 0, angle: 0, zone: null }],
  finish: null,
  movers: [{ type: 'rotor', w: 6, h: 0.7, x: 0, y: 9, speed: 0.7 }],
  currents: [],
  bounds: { minX: -13, maxX: 13, minY: -11, maxY: 15 },
};
