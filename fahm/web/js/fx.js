// Little touches: haptics and (optional) sounds. Respect the learner's settings.
import { platform } from './platform.js';

let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = false; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, start, dur, vol = 0.07, type = 'sine') {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  tap: () => tone(520, 0, 0.06, 0.04),
  ok: () => { tone(660, 0, 0.12); tone(880, 0.09, 0.16); },
  bad: () => { tone(300, 0, 0.18, 0.05, 'triangle'); },
  big: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.06)); },
};

export function fx(kind, settings) {
  if (settings.haptics) platform.haptic(kind === 'tap' ? 'tick' : kind);
  if (settings.sound && SOUNDS[kind]) SOUNDS[kind]();
}
