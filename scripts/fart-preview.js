// Renders each player's fart voice to WAV files in sound-preview/ so you can audition them
// without running the game. Usage: npm run sounds
import { mkdirSync, writeFileSync } from 'node:fs';
import { VOICES, synthFart } from '../src/fartsynth.js';

const SR = 44100;
const dir = new URL('../sound-preview/', import.meta.url);
mkdirSync(dir, { recursive: true });

const cut = (a, sec) => a.slice(0, Math.floor(sec * SR)).map((v, i, arr) => v * Math.min(1, (arr.length - i) / (0.05 * SR)));
const gap = (sec) => new Float32Array(Math.floor(sec * SR));
const join = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, (o += p.length) - p.length);
  return out;
};

VOICES.forEach((v, i) => {
  const slug = `p${i + 1}-${v.name.toLowerCase().replace(/\W+/g, '-')}`;
  const hold = synthFart(SR, v, { mode: 'hold', seed: i * 10 + 1 });
  const tail = synthFart(SR, v, { mode: 'tail', seed: i * 10 + 5 });
  const deflate = synthFart(SR, v, { mode: 'deflate', seed: i + 3 });
  // a full demo: two taps, a held fart with its sputter, then running dry
  const demo = join(
    cut(synthFart(SR, v, { mode: 'hold', seed: i * 10 + 2 }), 0.18), gap(0.25),
    cut(synthFart(SR, v, { mode: 'hold', seed: i * 10 + 3 }), 0.18), gap(0.5),
    cut(hold, 1.2), tail, gap(0.6),
    cut(synthFart(SR, v, { mode: 'hold', seed: i * 10 + 4 }), 0.9), deflate,
  );
  writeFileSync(new URL(`${slug}.wav`, dir), wav(demo));
  console.log(`sound-preview/${slug}.wav  (${(demo.length / SR).toFixed(1)} s)`);
});

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}
