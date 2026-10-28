// In-game HUD: timer, checkpoint, splats, the 4 player cards and big centre messages.
// Player names come from other people, so they only ever go in via textContent.

import { TICK_RATE } from './sim/sim.js';
import { PLAYER_COLORS } from './render.js';
import { VOICES } from './fartsynth.js';

const $ = (id) => document.getElementById(id);
const KEYS = ['Z', 'X', 'C', 'V'];

export function fmtTime(ticks) {
  return fmtMs((ticks * 1000) / TICK_RATE);
}

export function fmtMs(ms) {
  const t = ms / 1000;
  const m = Math.floor(t / 60);
  return `${m}:${(t % 60).toFixed(2).padStart(5, '0')}`;
}

export function createHud() {
  let level = null;
  let mode = 'solo';
  let you = null;

  const cards = PLAYER_COLORS.map((color, i) => {
    const el = document.createElement('div');
    el.className = 'player';
    el.style.setProperty('--c', color);
    // one thing per line so nothing overlaps: name (+ a puff while farting), voice, gas bar
    el.innerHTML = `
      <div class="top"><span class="dot"></span><span class="label"></span><span class="puff" aria-hidden="true">💨</span></div>
      <div class="voice"></div>
      <div class="bar"><div class="fill"></div><span class="bar-text"></span></div>
      <div class="keys"></div>`;
    $('players').appendChild(el);
    return {
      el,
      label: el.querySelector('.label'),
      voice: el.querySelector('.voice'),
      fill: el.querySelector('.fill'),
      barText: el.querySelector('.bar-text'),
      keys: el.querySelector('.keys'),
    };
  });

  let messageTimer = 0;
  function showMessage(text, sub = '', ms = 0) {
    const m = $('message');
    m.querySelector('.big').textContent = text;
    m.querySelector('small').textContent = sub;
    m.classList.add('show');
    clearTimeout(messageTimer);
    if (ms) messageTimer = setTimeout(() => m.classList.remove('show'), ms);
  }
  const hideMessage = () => $('message').classList.remove('show');

  // solo: P1..P4 with their keys. online: names, "you" highlighted, no per-player keys.
  function setPlayers(seats, yourSeat = null) {
    mode = seats ? 'online' : 'solo';
    you = yourSeat;
    cards.forEach((c, i) => {
      const seat = seats && seats[i];
      c.label.textContent = seats ? (seat ? seat.name : 'empty seat') : `P${i + 1}`;
      c.voice.textContent = VOICES[i].name;
      c.el.classList.toggle('you', i === you);
      c.el.classList.toggle('away', !!seats && (!seat || !seat.connected));
      c.keys.innerHTML = seats ? (i === you ? 'you' : '') : `<kbd>${i + 1}</kbd> select · <kbd>${KEYS[i]}</kbd> fart`;
    });
  }

  function setLevel(l) {
    level = l;
    $('level-name').textContent = l.number ? `Level ${l.number} · ${l.name}` : l.name;
  }

  function update(s, input) {
    $('timer').textContent = fmtTime(s.timeTicks);
    const cps = level ? level.checkpoints.length - 1 : 0;
    $('cp').textContent = s.checkpoint === 0 ? 'Start' : `${s.checkpoint} / ${cps}`;
    $('deaths').textContent = s.deaths;
    s.players.forEach((p, i) => {
      const c = cards[i];
      c.el.style.display = s.crew && !s.crew.includes(i) ? 'none' : ''; // only the crew's cards
      c.el.classList.toggle('active', mode === 'solo' && input.state.active === i);
      c.el.classList.toggle('farting', p.farting);
      // out of gas: the card flashes red (CSS animation on adding the class) and stays red
      // until the tank is back to 20% and you can fart again
      c.el.classList.toggle('empty', p.empty);
      c.fill.style.width = `${(p.gas * 100).toFixed(1)}%`;
      c.barText.textContent = p.empty ? 'EMPTY' : '';
    });
  }

  return { showMessage, hideMessage, setPlayers, setLevel, update };
}
