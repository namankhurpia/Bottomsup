// Client entry. Three modes share one renderer and one frame loop:
//   menu   - landing screen; a local pond sim bobs along in the background
//   solo   - local sim of level 1, you drive all four players
//   online - the server runs the sim; we send our seat's buttons and draw its snapshots

import RAPIER from '@dimforge/rapier2d-compat';
import { createSim, DT, NUM_PLAYERS } from './sim/sim.js';
import { LEVELS, RACE_LEVELS } from './sim/levels.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud, fmtMs, fmtTime } from './hud.js';
import { createNet } from './net.js';

await RAPIER.init();

const $ = (id) => document.getElementById(id);
const view = createRenderer($('game'));
const audio = createAudio();
const hud = createHud();

let mode = null;
let frameFn = () => {};

const input = createInput({
  onRespawn: () => (mode === 'solo' ? local && local.sim.respawn() : mode === 'online' && net.send({ t: 'respawn' })),
  onRestart: () => mode === 'solo' && startSolo(),
  onToggleHelp: () => mode !== 'menu' && $('help').classList.toggle('hidden'),
  onToggleMute: () => mode !== 'menu' && hud.showMessage(audio.toggleMute() ? 'Muted' : 'Sound on', '', 800),
  screenToWorld: (x, y) => view.screenToWorld(x, y),
});

function setBodyClass(prefix, value) {
  for (const c of [...document.body.classList]) if (c.startsWith(prefix)) document.body.classList.remove(c);
  if (value) document.body.classList.add(prefix + value);
}
function setMode(m) {
  mode = m;
  setBodyClass('mode-', m);
  if (m !== 'online') setBodyClass('phase-', null);
}

// --- local sim runner (menu backdrop + solo) -----------------------------------------
let local = null;
function runLocal(levelId, { onEvents = () => {}, commands }) {
  if (local) local.sim.free();
  const sim = createSim(RAPIER, LEVELS[levelId]);
  local = { sim, prev: sim.snapshot(), curr: null, acc: 0 };
  local.curr = local.prev;
  view.setLevel(LEVELS[levelId]);
  return (dt) => {
    local.acc += dt;
    let steps = 0;
    while (local.acc >= DT && steps++ < 6) {
      const events = local.sim.step(commands(local.curr));
      local.prev = local.curr;
      local.curr = local.sim.snapshot();
      onEvents(events, local.curr);
      local.acc -= DT;
    }
    if (steps > 6) local.acc = 0;
    return { prev: local.prev, curr: local.curr, alpha: local.acc / DT };
  };
}

function soundsFor(events, { skipSeat = null } = {}) {
  for (const e of events) {
    if (e.player === skipSeat && (e.type === 'fartStart' || e.type === 'fartEnd')) continue;
    if (e.type === 'fartStart') audio.fartStart(e.player);
    else if (e.type === 'fartEnd') audio.fartEnd(e.player);
    else if (e.type === 'empty') audio.empty(e.player);
  }
}

function commonEvents(events) {
  for (const e of events) {
    if (e.type === 'checkpoint') {
      audio.checkpoint();
      hud.showMessage('Checkpoint!', '', 1200);
    } else if (e.type === 'ouch') {
      audio.ouch();
      view.shake(0.8);
      hud.showMessage('SPLAT!', 'Back to the checkpoint…', 1100);
    } else if (e.type === 'respawned') {
      view.snapCamera();
    }
  }
}

// --- menu -------------------------------------------------------------------------------
function toMenu() {
  setMode('menu');
  input.setSeat(null);
  view.setSeats(null);
  hud.hideMessage();
  // attract mode: someone toots now and then so the pond looks alive
  let t = 0;
  const who = Array(NUM_PLAYERS).fill(0);
  const step = runLocal('pond', {
    commands: () => {
      t++;
      if (t % 70 === 0) who[(Math.random() * NUM_PLAYERS) | 0] = 12 + ((Math.random() * 25) | 0);
      return who.map((n, i) => {
        who[i] = Math.max(0, n - 1);
        return { aim: 0, move: 0, fart: n > 0 };
      });
    },
  });
  frameFn = (dt) => {
    const { prev, curr, alpha } = step(dt);
    view.render(prev, curr, alpha, dt, input.state);
  };
  loadBoard($('landing-board'), landingCrew);
}

// landing leaderboard tabs: one board per crew size
let landingCrew = 4;
for (const tab of document.querySelectorAll('#crew-tabs button')) {
  tab.onclick = () => {
    landingCrew = Number(tab.dataset.crew);
    for (const t of document.querySelectorAll('#crew-tabs button')) t.classList.toggle('on', t === tab);
    loadBoard($('landing-board'), landingCrew);
  };
}

// --- solo -------------------------------------------------------------------------------
let best = null;
try {
  best = Number(localStorage.getItem('tootraft.best.1')) || null;
} catch {}

function startSolo() {
  setMode('solo');
  input.setSeat(null);
  view.setSeats(null);
  hud.setPlayers(null);
  hud.setLevel(LEVELS.canal);
  $('best').textContent = best ? fmtTime(best) : '—';
  const startCp = Number(new URLSearchParams(location.search).get('cp')) || 0;
  const step = runLocal('canal', {
    commands: (s) => input.getCommands(DT, s),
    onEvents: (events, s) => {
      soundsFor(events);
      commonEvents(events);
      for (const e of events) {
        if (e.type === 'go') hud.hideMessage();
        if (e.type !== 'finish') continue;
        audio.finish();
        // only full runs from the start count toward the best time
        const isBest = startCp === 0 && (!best || e.timeTicks < best);
        if (isBest) {
          best = e.timeTicks;
          try {
            localStorage.setItem('tootraft.best.1', String(best));
          } catch {}
          $('best').textContent = fmtTime(best);
        }
        hud.showMessage(`Finished! ${fmtTime(e.timeTicks)}`, `${isBest ? 'New best · ' : ''}${s.deaths} splats · Enter to race again`);
      }
    },
  });
  if (startCp) local.sim.restart(startCp), (local.prev = local.curr = local.sim.snapshot());
  hud.showMessage('Ready?', 'Fart to start the clock');
  $('help').classList.remove('hidden');
  frameFn = (dt) => {
    const { prev, curr, alpha } = step(dt);
    view.render(prev, curr, alpha, dt, input.state);
    hud.update(curr, input);
  };
}

// --- online -------------------------------------------------------------------------------
const ERRORS = {
  'bad-name': 'Pick a name first (up to 16 characters).',
  'room-not-found': 'No room with that code. Check the 4 digits?',
  'room-full': 'That room already has 4 players.',
  'in-progress': "That room is mid-race. Wait for them to finish.",
  'not-host': 'Only the host can do that.',
  'already-in-room': 'You are already in a room.',
};
const INTERP_MS = 100; // draw the world this far in the past so there are always two snapshots to blend

const online = { seat: null, room: null, level: null, snaps: [], sent: null, sentAt: 0, myFart: false, lastCount: null };

const net = createNet({
  onStatus: (st) => {
    const bar = $('net-status');
    bar.textContent = st === 'reconnecting' ? 'Connection lost, reconnecting…' : '';
    bar.classList.toggle('show', mode === 'online' && st === 'reconnecting');
  },
  onMessage: (m) => {
    if (m.t === 'welcome') enterOnline(m.seat);
    else if (m.t === 'room') applyRoom(m.room);
    else if (m.t === 'snap') receiveSnap(m);
    else if (m.t === 'error') showError(m.code);
    else if (m.t === 'left') toMenu();
  },
});

function showError(code) {
  if (mode === 'online') return hud.showMessage(ERRORS[code] || 'Something went wrong', '', 1600);
  if (code === 'room-not-found' && net.hasSession()) net.clearSession(); // stale rejoin
  $('landing-error').textContent = ERRORS[code] || 'Something went wrong.';
}

function enterOnline(seat) {
  online.seat = seat;
  online.room = null;
  online.level = null;
  online.snaps = [];
  online.myFart = false;
  setMode('online');
  input.setSeat(seat);
  $('landing-error').textContent = '';
  $('help').classList.add('hidden');
  frameFn = onlineFrame;
}

function applyRoom(room) {
  const was = online.room ? online.room.phase : null;
  online.room = room;
  if (room.level !== online.level) {
    online.level = room.level;
    online.snaps = []; // never blend across a level change
    view.setLevel(LEVELS[room.level]);
    hud.setLevel(LEVELS[room.level]);
  }
  view.setSeats(room.seats.map((s) => s && { name: s.name, occupied: true }));
  hud.setPlayers(room.seats, online.seat);
  setBodyClass('phase-', room.phase);
  if (room.phase === 'countdown' && was !== 'countdown') input.setSeat(online.seat); // everyone starts facing the centre
  if (room.phase === 'lobby') {
    if (was && was !== 'lobby') hud.hideMessage();
    renderLobby(room);
  }
  if (room.phase === 'results' && was !== 'results') {
    audio.finish();
    hud.hideMessage();
    renderResults(room);
  }
  if (room.phase === 'results') renderResultButtons(room);
}

function renderLobby(room) {
  $('room-code').textContent = room.code;
  const list = $('seats');
  list.textContent = '';
  const colors = ['#ff5a5f', '#3fa7ff', '#ffc93c', '#5ad16a'];
  room.seats.forEach((s, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--c', colors[i]);
    li.className = s ? `filled${s.connected ? '' : ' away'}` : '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = s ? s.name : 'waiting for a player…';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = [i === online.seat ? 'you' : '', i === room.host ? 'host' : '', s && !s.connected ? 'away' : ''].filter(Boolean).join(' · ');
    li.append(dot, who, tag);
    list.append(li);
  });
  const ready = room.seats.filter((s) => s && s.connected).length;
  const isHost = room.host === online.seat;
  const split = { 1: 'the whole raft to yourself', 2: 'half the raft each', 3: 'a third of the raft each', 4: 'a quarter each' }[ready];
  $('lobby-status').textContent = `${ready} player${ready === 1 ? '' : 's'}: ${split}` + (isHost ? '' : '. Waiting for the host…');
  $('start').disabled = !isHost;
  $('start').textContent = ready === NUM_PLAYERS ? 'Start race' : `Start race with ${ready}`;
  $('start').style.display = isHost ? '' : 'none';
}

function renderResults(room) {
  const r = room.result;
  if (!r) return;
  $('result-level').textContent = `Level ${LEVELS[r.level].number} · ${r.levelName}`;
  $('result-time').textContent = fmtMs(r.timeMs);
  $('result-detail').textContent = `${r.points} points · #${r.rank} of ${r.of} ${crewLabel(r.crewSize)} crews`;
  $('result-crew').textContent = `${r.players.join(', ')} · ${r.deaths} splat${r.deaths === 1 ? '' : 's'} (they don't count)`;
  loadBoard($('result-board'), r.crewSize, r.id);
}

function renderResultButtons(room) {
  const isHost = room.host === online.seat;
  $('again').style.display = isHost ? '' : 'none';
  $('to-pond').style.display = isHost ? '' : 'none';
  $('results-wait').textContent = isHost ? '' : 'Waiting for the host to pick what is next…';
}

function receiveSnap(m) {
  m.at = performance.now();
  online.snaps.push(m);
  if (online.snaps.length > 30) online.snaps.shift();
  for (const e of m.ev) {
    if (e.type === 'empty' && e.player === online.seat && online.myFart) {
      audio.fartEnd(online.seat); // our own fart sound is local; stop it before the deflate squeak
      online.myFart = false;
    }
  }
  soundsFor(m.ev, { skipSeat: online.seat });
  commonEvents(m.ev);
  for (const e of m.ev) {
    if (e.type === 'go' && m.phase === 'race') hud.showMessage('GO!', '', 800); // the pond's first fart also says 'go'
  }
}

function onlineFrame(dt, now) {
  const snaps = online.snaps;
  if (!snaps.length) return; // nothing from the server yet
  const latest = snaps[snaps.length - 1];

  // interpolate between the two snapshots around (now - INTERP_MS)
  const t = now - INTERP_MS;
  let a = snaps[0];
  let b = snaps[0];
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].at <= t) {
      a = snaps[i - 1];
      b = snaps[i];
      break;
    }
  }
  if (t >= latest.at) a = b = latest;
  const alpha = b.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) : 1;
  view.render(a.s, b.s, alpha, dt, input.state);
  hud.update(latest.s, input);

  if (latest.phase === 'countdown') {
    const n = Math.ceil(latest.cd / 60);
    if (n !== online.lastCount && n > 0) {
      online.lastCount = n;
      hud.showMessage(String(n), n === 3 ? 'Get ready to toot' : '');
    }
  } else online.lastCount = null;

  // our seat's buttons -> server (on change, plus a heartbeat)
  const mine = input.getCommands(dt, latest.s)[online.seat];
  const canFart = latest.phase === 'lobby' || latest.phase === 'race';
  // play our own fart instantly instead of waiting a round trip for the server's event
  if (mine.fart && !online.myFart && canFart && !latest.s.players[online.seat].empty) {
    online.myFart = true;
    audio.fartStart(online.seat);
  } else if (!mine.fart && online.myFart) {
    online.myFart = false;
    audio.fartEnd(online.seat);
  }
  const s = online.sent;
  const changed = !s || s.fart !== mine.fart || s.move !== mine.move || Math.abs(s.aim - mine.aim) > 0.02;
  if (changed || now - online.sentAt > 100) {
    net.send({ t: 'input', fart: mine.fart, move: mine.move, aim: Math.round(mine.aim * 1000) / 1000 });
    online.sent = mine;
    online.sentAt = now;
  }
}

function leaveRoom() {
  if (mode === 'online') {
    net.send({ t: 'leave' });
    net.close();
    if (online.myFart) audio.fartEnd(online.seat);
  }
  toMenu();
}

// --- leaderboard ------------------------------------------------------------------------
const crewLabel = (n) => ({ 1: 'solo', 2: '2-player', 3: '3-player', 4: '4-player' })[n] || '';

async function loadBoard(table, crewSize = 4, highlightId = null) {
  try {
    const res = await fetch(`/api/leaderboard?level=${RACE_LEVELS[0]}&crew=${crewSize}`);
    if (!res.ok) throw new Error(res.status);
    renderBoard(table, (await res.json()).top.slice(0, 10), highlightId);
  } catch {
    renderBoard(table, null);
  }
}

function renderBoard(table, rows, highlightId) {
  table.textContent = '';
  const head = table.insertRow();
  for (const h of ['#', 'Crew', 'Time', 'Points', 'When']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }
  if (!rows || !rows.length) {
    const tr = table.insertRow();
    tr.className = 'empty-row';
    const td = tr.insertCell();
    td.colSpan = 5;
    td.textContent = rows ? 'No races yet. Be the first crew on the board!' : 'Leaderboard is offline right now.';
    return;
  }
  rows.forEach((r, i) => {
    const tr = table.insertRow();
    if (r.id === highlightId) tr.className = 'mine';
    const cells = [
      [String(i + 1), 'num'],
      [r.players.join(', '), 'crew'],
      [fmtMs(r.time_ms), 'num'],
      [String(r.points), 'num'],
      [new Date(r.finished_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), 'when'],
    ];
    for (const [text, cls] of cells) {
      const td = tr.insertCell();
      td.textContent = text;
      td.className = cls;
    }
  });
}

// --- landing buttons --------------------------------------------------------------------
const nameInput = $('name');
try {
  nameInput.value = localStorage.getItem('tootraft.name') || '';
} catch {}
function playerName() {
  const name = nameInput.value.trim();
  if (!name) {
    $('landing-error').textContent = ERRORS['bad-name'];
    nameInput.focus();
    return null;
  }
  try {
    localStorage.setItem('tootraft.name', name);
  } catch {}
  return name;
}
$('create').onclick = () => {
  const name = playerName();
  if (!name) return;
  net.open();
  net.send({ t: 'create', name });
};
function join() {
  const name = playerName();
  const code = $('code').value.trim();
  if (!name) return;
  if (!/^\d{4}$/.test(code)) {
    $('landing-error').textContent = 'Room codes are 4 digits.';
    return $('code').focus();
  }
  net.open();
  net.send({ t: 'join', name, code });
}
$('join').onclick = join;
$('code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
$('code').addEventListener('input', (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)));
$('solo').onclick = startSolo;
$('leave').onclick = leaveRoom;
$('start').onclick = () => net.send({ t: 'start' });
$('again').onclick = () => net.send({ t: 'start' });
$('to-pond').onclick = () => net.send({ t: 'lobby' });

// A hidden tab stops running frames, so tell the server we let go of everything.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || mode !== 'online') return;
  net.send({ t: 'input', fart: false, move: 0, aim: online.sent ? online.sent.aim : 0 });
  online.sent = null;
  if (online.myFart) {
    online.myFart = false;
    audio.fartEnd(online.seat);
  }
});

// --- go -----------------------------------------------------------------------------------
toMenu();
if (net.hasSession()) {
  $('landing-error').textContent = 'Rejoining your room…';
  net.open();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frameFn(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handle for debugging / automated checks in the console.
window.__toot = {
  input, online, net,
  get mode() { return mode; },
  get sim() { return local && local.sim; },
  get state() { return mode === 'online' ? online.snaps.at(-1)?.s : local && local.curr; },
};
