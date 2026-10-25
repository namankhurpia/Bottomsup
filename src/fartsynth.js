// Procedural fart synthesis. Pure math into a Float32Array, so it runs in the browser
// (into an AudioBuffer) and in Node (to export preview WAVs).
//
// A real fart is a train of irregular "flaps": short pulses whose rate (the pitch) wobbles,
// jitters and droops, with dropped flaps (sputter) and some gated air noise (wetness),
// coloured by a resonant body. That irregularity is what sells it; a clean tone sounds like a kazoo.

export const VOICES = [
  // P1 red: the all-rounder
  { name: 'Classic', f0: 92, f1: 68, jitter: 0.14, wobble: 0.16, wet: 0.22, sputter: 0.06, res: 260, bright: 1100 },
  // P2 blue: high, tight and squeaky
  { name: 'Squeaker', f0: 240, f1: 300, jitter: 0.05, wobble: 0.12, wet: 0.05, sputter: 0.03, res: 700, bright: 2600 },
  // P3 yellow: deep bass rumble
  { name: 'Rumbler', f0: 44, f1: 34, jitter: 0.2, wobble: 0.2, wet: 0.3, sputter: 0.08, res: 150, bright: 650 },
  // P4 green: loose and wet
  { name: 'Wet One', f0: 115, f1: 78, jitter: 0.35, wobble: 0.28, wet: 0.75, sputter: 0.16, res: 340, bright: 1500 },
];

// mode: 'hold'    the main fart (punchy start, sustains, slowly droops)
//       'tail'    the "pbbt-pt-pt" sputter played when you let go
//       'deflate' the sad squeak when the tank runs dry
export function synthFart(sampleRate, voice, { mode = 'hold', duration, seed = 1, pitch = 1 } = {}) {
  const dur = duration ?? { hold: 2.6, tail: 0.38, deflate: 0.75 }[mode];
  const n = Math.floor(dur * sampleRate);
  const raw = new Float32Array(n);
  const air = new Float32Array(n);
  const rand = rng(seed * 7919 + voice.f0);

  const w1 = 2 + rand() * 3;
  const w2 = 6 + rand() * 5;
  const ph1 = rand() * 6.283;
  const ph2 = rand() * 6.283;

  let t = 0;
  while (t < dur) {
    const u = t / dur;
    let f;
    let amp = 0.75 + 0.25 * rand();
    let skip = voice.sputter;

    if (mode === 'hold') {
      const kick = 1 + 0.4 * Math.exp(-t / 0.045); // the "toot" at the start
      const droop = voice.f0 + (voice.f1 - voice.f0) * Math.min(1, t / 2.2);
      const wob = 1 + voice.wobble * (0.65 * Math.sin(6.283 * w1 * t + ph1) + 0.35 * Math.sin(6.283 * w2 * t + ph2));
      f = droop * kick * wob;
      amp *= t < 0.14 ? 1.25 : 0.85 + 0.15 * Math.sin(6.283 * 1.3 * t + ph2);
    } else if (mode === 'tail') {
      // speeding-up, rising, breaking-up flaps: pbbt-pt-pt
      f = voice.f0 * (0.8 + 0.9 * u) * (1 + 0.15 * (rand() - 0.5));
      amp *= Math.pow(1 - u, 1.4);
      skip = 0.15 + 0.6 * u;
    } else {
      // deflate: thin squeal sliding down, like letting air out of a balloon
      f = voice.f0 * 2.6 * (1.25 - 0.75 * u) * (1 + 0.06 * Math.sin(6.283 * 9 * t));
      amp *= 0.55 * (1 - u) * (u < 0.05 ? u / 0.05 : 1);
      skip = 0.02;
    }

    const period = (1 / (f * pitch)) * (1 + voice.jitter * (rand() * 2 - 1));
    if (rand() >= skip) {
      const start = Math.floor(t * sampleRate);
      const width = Math.max(4, Math.floor(period * sampleRate * (mode === 'deflate' ? 0.5 : 0.6 + 0.25 * rand())));
      for (let i = 0; i < width && start + i < n; i++) {
        const x = i / width;
        // asymmetric flap: snaps open, decays shut
        const env = x < 0.12 ? x / 0.12 : Math.exp(-(x - 0.12) * 5.5);
        raw[start + i] += amp * env;
        air[start + i] += amp * env * (rand() * 2 - 1);
      }
    }
    t += Math.max(period, 1 / 2000);
  }

  // colour it: dry flaps through a resonant body + brightness lowpass, plus filtered air
  const wetMix = mode === 'deflate' ? 0.1 : voice.wet;
  const body = biquad(raw, 'bandpass', voice.res, 2.5, sampleRate);
  const tone = biquad(raw, 'lowpass', voice.bright, 0.8, sampleRate);
  const hiss = biquad(air, 'bandpass', voice.bright * 0.6, 0.9, sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = tone[i] * 0.8 + body[i] * 1.6 + hiss[i] * wetMix * 2.2;

  const clean = biquad(out, 'highpass', 30, 0.7, sampleRate);
  // soft clip for grit, short fades so nothing clicks
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    clean[i] = Math.tanh(clean[i] * 2.4);
    peak = Math.max(peak, Math.abs(clean[i]));
  }
  const fadeIn = Math.floor(0.004 * sampleRate);
  const fadeOut = Math.floor(0.02 * sampleRate);
  for (let i = 0; i < n; i++) {
    let g = 0.9 / peak;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > n - fadeOut) g *= (n - i) / fadeOut;
    clean[i] *= g;
  }
  return clean;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// RBJ cookbook biquad, applied offline.
function biquad(x, type, freq, q, sr) {
  const w = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass, 0 dB peak
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}
