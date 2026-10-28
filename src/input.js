// Local input -> per-tick commands for all 4 players.
// One person drives all four: 1-4 pick a player, A/D (or arrows) walks them left / right on
// screen around their slice of the rim, Q/E or the mouse turns them away from facing the centre (W faces the centre again),
// Z/X/C/V fart for P1-P4, Space farts the selected player, F farts everyone. Hold Shift to walk/aim all four at once (easy solo: Shift + mouse
// to steer, F to go). Gamepad N controls player N.
// Online (setSeat(n)): you only drive seat n, and every fart key / click / pad farts it.

import { FACE_CENTER, NUM_PLAYERS } from './sim/sim.js';

const AIM_SPEED = 3.2; // rad/s while holding Q/E
const FART_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV'];

export function createInput({ onRespawn, onRestart, onToggleHelp, onToggleMute, screenToWorld }) {
  const keys = new Set();
  const state = {
    active: 0,
    group: false,
    aims: Array(NUM_PLAYERS).fill(FACE_CENTER), // turn away from facing the centre
    mouseDown: false,
    mouseAim: false, // right button held: the mouse steers your aim
    mouseX: 0,
    mouseY: 0,
    pads: [],
    seat: null, // online: the only seat this browser controls
    touch: null, // phones: { move, fart } from the on-screen controls (see touch.js)
  };
  const walkLock = Array(NUM_PLAYERS).fill(null); // per player: rim direction chosen when walking began
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName);

  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e)) return;
    keys.add(e.code);
    const digit = /^Digit([1-4])$/.exec(e.code);
    if (digit && state.seat === null) state.active = Number(digit[1]) - 1;
    if (e.code === 'Tab' && state.seat === null) state.active = (state.active + (e.shiftKey ? NUM_PLAYERS - 1 : 1)) % NUM_PLAYERS;
    if (e.code === 'KeyG') state.aims.fill(FACE_CENTER);
    if (e.code === 'KeyR') onRespawn();
    if (e.code === 'Enter') onRestart();
    if (e.code === 'KeyH') onToggleHelp();
    if (e.code === 'KeyM') onToggleMute();
    if (['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    state.mouseDown = false;
    state.mouseAim = false;
  });
  addEventListener('pointermove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  });
  addEventListener('pointerdown', (e) => {
    if (e.target.tagName !== 'CANVAS' || e.pointerType === 'touch') return; // phones use the on-screen button
    if (e.button === 0) state.mouseDown = true;
    if (e.button === 2) state.mouseAim = true;
  });
  addEventListener('pointerup', (e) => {
    if (e.button === 0) state.mouseDown = false;
    if (e.button === 2) state.mouseAim = false;
  });
  addEventListener('contextmenu', (e) => e.target.tagName === 'CANVAS' && e.preventDefault());

  // world direction -> that player's aim (turn away from facing the centre)
  const aimFor = (worldAngle, raft, player) => worldAngle - raft.angle - (player.pos + Math.PI);

  function getCommands(dt, { raft, players }) {
    const online = state.seat !== null;
    if (online) state.active = state.seat;
    const a = state.active;
    const group = !online && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    state.group = group;
    const targets = group ? [0, 1, 2, 3] : [a];
    const move = Array(NUM_PLAYERS).fill(0);
    // walking intent on screen: -1 = left, +1 = right (keyboard, then touch / d-pad below)
    const keyWalk = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const screenWalk = Array(NUM_PLAYERS).fill(0);
    for (const i of targets) {
      screenWalk[i] = keyWalk;
      if (keys.has('KeyQ')) state.aims[i] += AIM_SPEED * dt;
      if (keys.has('KeyE')) state.aims[i] -= AIM_SPEED * dt;
      if (keys.has('KeyW') || keys.has('ArrowUp')) state.aims[i] = FACE_CENTER;
      if (keys.has('KeyS') || keys.has('ArrowDown')) state.aims[i] = Math.PI; // face the water
    }

    // Mouse aim is opt-in (hold the right button, or Shift in solo): just moving the mouse to
    // click a button must not quietly turn you away from the centre.
    if ((state.mouseAim || group) && state.mouseX) {
      const w = screenToWorld(state.mouseX, state.mouseY);
      if (w && Math.hypot(w.x - raft.x, w.y - raft.y) > 1.6) {
        const toward = Math.atan2(w.y - raft.y, w.x - raft.x);
        for (const i of targets) state.aims[i] = aimFor(toward, raft, players[i]);
      }
    }

    const fart = FART_KEYS.map((k) => !online && (keys.has(k) || keys.has('KeyF')));
    if (keys.has('Space') || state.mouseDown) fart[a] = true;
    if (online && (keys.has('KeyF') || FART_KEYS.some((k) => keys.has(k)))) fart[a] = true;

    // on-screen controls: online they drive your seat; in solo the joystick walks everyone
    // and the button farts everyone (one thumb can't juggle four players)
    const t = state.touch;
    if (t) {
      for (const i of online ? [a] : [0, 1, 2, 3]) {
        if (t.walk) screenWalk[i] = t.walk;
        if (t.fart) fart[i] = true;
      }
    }

    // Gamepads: left stick aims (screen-relative), LB/RB or d-pad walks, RT or A farts.
    state.pads = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || state.pads.length >= (online ? 1 : NUM_PLAYERS)) continue;
      const i = online ? a : state.pads.length;
      state.pads.push(pad.id);
      const [lx, ly] = pad.axes;
      if (Math.hypot(lx, ly) > 0.45) state.aims[i] = aimFor(Math.atan2(-ly, lx), raft, players[i]);
      const b = pad.buttons;
      if (b[3] && b[3].pressed) state.aims[i] = FACE_CENTER; // Y: face the centre again
      if ((b[7] && b[7].value > 0.3) || (b[0] && b[0].pressed)) fart[i] = true;
      const held = (k) => b[k] && b[k].pressed;
      if (held(14)) screenWalk[i] = -1; // d-pad: left / right on screen
      if (held(15)) screenWalk[i] = 1;
      if (held(4)) move[i] = 1; // bumpers: straight round the rim (counter-clockwise / clockwise)
      if (held(5)) move[i] = -1;
    }

    // Left / right mean left / right on screen. Walking counter-clockwise (+1) moves you left
    // on the top half of the raft but right on the bottom half, so the rim direction depends
    // on where you stand. It's decided when you start walking and kept while you hold it, so
    // you carry on smoothly round the side instead of bouncing back at it.
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const h = screenWalk[i];
      if (!h) {
        walkLock[i] = null;
        continue;
      }
      if (!walkLock[i] || walkLock[i].h !== h) {
        const world = players[i].pos + raft.angle; // where you stand, in world angle
        const ccwGoesLeft = Math.sin(world) > -0.05; // top half (and the very sides)
        walkLock[i] = { h, dir: ccwGoesLeft ? -h : h };
      }
      move[i] = walkLock[i].dir * Math.min(1, Math.abs(h));
    }

    for (let i = 0; i < NUM_PLAYERS; i++) state.aims[i] = wrap(state.aims[i]);
    return state.aims.map((aim, i) => ({ aim, fart: fart[i], move: move[i] }));
  }

  function setSeat(seat) {
    state.seat = seat;
    state.active = seat ?? 0;
    state.aims.fill(FACE_CENTER);
  }

  return { state, getCommands, setSeat };
}

function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
