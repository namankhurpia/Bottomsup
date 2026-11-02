// Takes the README screenshots: starts a throwaway server (its own port and data folder),
// drives headless Chrome over the DevTools protocol, and saves its 4 pictures to
// docs/screenshots/. Usage: npm run build && npm run screenshots
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { LEVELS } from '../src/sim/levels.js';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a throwaway server with a little history, so the boards and pages aren't empty
const dataDir = mkdtempSync(join(tmpdir(), 'bottoms-shots-'));
const server = await startServer({ port: 0, dataDir, log: () => {} });
const base = `http://127.0.0.1:${server.port}`;
const day = (d, h) => new Date(Date.UTC(2026, 9, d, h, 12)).toISOString();
const seed = [
  ['canal', ['Naman', 'Priya', 'Arjun', 'Sam'], 64200, 'Oct 20'],
  ['canal', ['Naman', 'Priya'], 81900, 'Oct 21'],
  ['canal', ['Zoe', 'Kai', 'Lena', 'Omar'], 70400, 'Oct 22'],
  ['plank', ['Naman', 'Priya', 'Arjun', 'Sam'], 66100, 'Oct 23'],
  ['canal', ['Solo Steve'], 96000, 'Oct 24'],
  ['plank', ['Zoe', 'Kai', 'Lena', 'Omar'], 74800, 'Oct 25'],
  ['canal', ['Mia', 'Raj', 'Tom'], 77300, 'Oct 26'],
  ['inferno', ['Zoe', 'Kai', 'Lena', 'Omar'], 412000, 'Oct 27'],
  ['wells', ['Mia', 'Raj', 'Tom'], 118000, 'Oct 28'],
];
seed.forEach(([level, players, timeMs], i) => {
  const par = LEVELS[level].par;
  server.db.saveGame({ level, room: '1234', players, crewSize: players.length, timeMs, points: Math.round((1000 * par * 1000) / timeMs), deaths: i % 3, startedAt: day(20 + i, 18), finishedAt: day(20 + i, 19) });
});

// --- headless Chrome + a tiny DevTools-protocol client
const profile = mkdtempSync(join(tmpdir(), 'bottoms-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--no-first-run',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800', '--hide-scrollbars', '--mute-audio',
], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  wsUrl = await fetch('http://127.0.0.1:9333/json/version').then((r) => r.json()).then((j) => j.webSocketDebuggerUrl).catch(() => null);
}
const cdp = new WebSocket(wsUrl);
await new Promise((r) => cdp.on('open', r));
let nextId = 1;
const pending = new Map();
cdp.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) {
    const { ok, fail } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? fail(new Error(m.error.message)) : ok(m.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((ok, fail) => {
    const id = nextId++;
    pending.set(id, { ok, fail });
    cdp.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function openTab({ width = 1280, height = 800, mobile = false } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile }, sessionId);
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  // headless tabs count as hidden; keep their frames running like a real foreground tab
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  const tab = {
    sessionId,
    close: () => send('Target.closeTarget', { targetId }),
    // software rendering is slow, so go by the game's own state, not the clock
    waitForGo: async () => {
      for (let i = 0; i < 120 && (await tab.eval(`return __toot.state && __toot.state.phase;`)) !== 'playing'; i++) await sleep(1000);
      await sleep(2500);
    },
    eval: async (expr) => (await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, sessionId)).result.value,
    go: async (url) => {
      await send('Page.navigate', { url }, sessionId);
      await sleep(2500);
    },
    shot: async (name) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
      console.log('saved docs/screenshots/' + name);
    },
    key: (code, down = true) => send('Runtime.evaluate', { expression: `dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}' }))` }, sessionId),
  };
  return tab;
}

try {
  // 1. top races, with the seeded history
  const host = await openTab();
  await host.go(base);
  await host.eval(`document.getElementById('open-history').click();`);
  await sleep(1500);
  await host.shot('history.png');
  await host.close();

  // 2. the two levels the README shows, in solo practice
  const hole = LEVELS.wells.wells[1];
  const ring = LEVELS.inferno.movers[0];
  for (const [id, file, x, y] of [
    ['wells', 'level5.png', hole.x - hole.r - 2, hole.y], ['inferno', 'level6.png', ring.x, ring.y],
  ]) {
    const t = await openTab();
    await t.go(`${base}/?practice=${id}`);
    await t.waitForGo();
    await t.eval(`document.getElementById('help').classList.add('hidden'); setInterval(() => __toot.sim.debugPlace(${x}, ${y}, 0), 30);`);
    await sleep(3000);
    await t.shot(file);
    await t.close();
  }

  // 3. on a phone: the lobby with the joystick and fart button
  const phone = await openTab({ width: 390, height: 844, mobile: true });
  await phone.go(base);
  await phone.eval(`document.getElementById('name').value = 'Zoe'; document.getElementById('create').click();`);
  await sleep(2500);
  await phone.shot('phone.png');
  // README-friendly: JPEGs about a tenth the size of the PNGs (macOS's sips)
  if (process.platform === 'darwin') {
    const { execFileSync } = await import('node:child_process');
    const { readdirSync, unlinkSync } = await import('node:fs');
    for (const f of readdirSync(OUT).filter((f) => f.endsWith('.png'))) {
      const width = f === 'phone.png' ? 700 : 1600;
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', String(width), join(OUT, f), '--out', join(OUT, f.replace('.png', '.jpg'))], { stdio: 'ignore' });
      unlinkSync(join(OUT, f));
    }
    console.log('converted to JPEG');
  }
} finally {
  cdp.close();
  chrome.kill();
  await server.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}
