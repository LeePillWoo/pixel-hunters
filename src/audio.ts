// Tiny chiptune sound effects synthesized with WebAudio, so the game needs no audio files.

type Wave = OscillatorType;
interface Note {
  f: number; // start frequency (Hz)
  to?: number; // slide to this frequency
  t?: number; // start offset (s)
  d: number; // duration (s)
  wave?: Wave;
  vol?: number;
}

const SOUNDS: Record<string, { notes: Note[]; noise?: { d: number; vol: number } }> = {
  merge: { notes: [{ f: 660, d: 0.06, wave: 'square', vol: 0.12 }, { f: 990, t: 0.06, d: 0.09, wave: 'square', vol: 0.12 }] },
  fusion: {
    notes: [523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.06, d: 0.1, wave: 'square' as Wave, vol: 0.1 })),
  },
  combo: { notes: [{ f: 880, to: 1760, d: 0.12, wave: 'triangle', vol: 0.15 }] },
  coin: { notes: [{ f: 1320, d: 0.05, wave: 'square', vol: 0.08 }, { f: 1760, t: 0.05, d: 0.08, wave: 'square', vol: 0.08 }] },
  pop: { notes: [{ f: 700, to: 900, d: 0.04, wave: 'triangle', vol: 0.06 }] },
  hit: { notes: [{ f: 180, to: 90, d: 0.07, wave: 'square', vol: 0.08 }], noise: { d: 0.05, vol: 0.06 } },
  crit: { notes: [{ f: 300, to: 120, d: 0.1, wave: 'square', vol: 0.12 }], noise: { d: 0.08, vol: 0.1 } },
  hurt: { notes: [{ f: 220, to: 110, d: 0.12, wave: 'sawtooth', vol: 0.07 }] },
  break: {
    notes: [{ f: 1200, to: 300, d: 0.25, wave: 'square', vol: 0.12 }, { f: 200, t: 0.02, to: 60, d: 0.3, wave: 'triangle', vol: 0.2 }],
    noise: { d: 0.2, vol: 0.15 },
  },
  quest: {
    notes: [523, 659, 784, 1047, 784, 1047].map((f, i) => ({ f, t: i * 0.08, d: 0.12, wave: 'square' as Wave, vol: 0.09 })),
  },
  event: { notes: [{ f: 1568, d: 0.08, wave: 'triangle', vol: 0.12 }, { f: 2093, t: 0.09, d: 0.14, wave: 'triangle', vol: 0.12 }] },
  up: { notes: [392, 523, 659].map((f, i) => ({ f, t: i * 0.05, d: 0.08, wave: 'square' as Wave, vol: 0.09 })) },
  deny: { notes: [{ f: 160, d: 0.1, wave: 'square', vol: 0.07 }, { f: 120, t: 0.1, d: 0.12, wave: 'square', vol: 0.07 }] },
  warn: { notes: [{ f: 988, d: 0.06, wave: 'square', vol: 0.08 }, { f: 988, t: 0.1, d: 0.06, wave: 'square', vol: 0.08 }] },
};

const MUTE_KEY = 'pixel-hunters-muted';
const MIN_GAP = 0.04; // the same sound never plays twice within this many seconds

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
const lastPlayed: Record<string, number> = {};

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // storage blocked: sound stays on
}

/** Browsers only allow audio after a user gesture; call this from the first click. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

export const isMuted = () => muted;

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // not persisted
  }
}

export function sfx(name: keyof typeof SOUNDS) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - (lastPlayed[name] ?? -1) < MIN_GAP) return;
  lastPlayed[name] = now;
  const def = SOUNDS[name];
  for (const n of def.notes) {
    const start = now + (n.t ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.wave ?? 'square';
    osc.frequency.setValueAtTime(n.f, start);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.d);
    gain.gain.setValueAtTime(n.vol ?? 0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + n.d + 0.02);
  }
  if (def.noise && noiseBuf) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = noiseBuf;
    gain.gain.setValueAtTime(def.noise.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + def.noise.d);
    src.connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + def.noise.d + 0.02);
  }
}
