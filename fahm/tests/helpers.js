// Node test helpers: load the real app data from disk and build an Engine with an in-memory store.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Lexicon } from '../web/js/core/lexicon.js';
import { Engine } from '../web/js/core/engine.js';
import { createStore, defaultState } from '../web/js/core/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

export const io = {
  json: async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8')),
  bin: async (p) => {
    const b = await readFile(path.join(ROOT, p));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  },
};

let lexPromise;
export function loadLexicon() {
  return (lexPromise ||= Lexicon.load(io));
}

export class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

export async function makeEngine({ day = new Date('2026-03-02T12:00:00Z'), seed = 1 } = {}) {
  const lex = await loadLexicon();
  const storage = new MemoryStorage();
  const store = createStore(storage, { saveDelay: 1e9 });
  let clock = day;
  let s = seed;
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const engine = new Engine(lex, store, io, { now: () => clock, random });
  return { engine, lex, store, storage, advance(days) { clock = new Date(clock.getTime() + days * 86400000); }, now: () => clock };
}

/** Play a whole plan like a learner who answers everything correctly (or wrong with probability `pWrong`). */
export async function playPlan(engine, plan, { pWrong = 0, rand = Math.random, stepMs = null } = {}) {
  await engine.prepare(plan);
  const session = engine.startSession(plan);
  let guard = 0;
  session.begin(0);
  let t = 0;
  while (!session.done && guard++ < 500) {
    const step = session.step;
    t += stepMs ? stepMs(step) : 6000;
    if (step.t === 'meet') {
      session.answer({}, t);
      continue;
    }
    const q = engine.buildExercise(step);
    if (!q) throw new Error('no exercise for ' + JSON.stringify(step));
    if (q.type === 'match') {
      session.answer({ pairs: q.left.length, wrongIds: [] }, t);
    } else {
      const wrong = rand() < pWrong;
      session.answer({ correct: !wrong }, t);
    }
  }
  return session.finish({ completed: session.done });
}
