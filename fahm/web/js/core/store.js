// All learner data lives in one small JSON document saved to localStorage (and mirrored to a backup key).
// Schema changes go through migrate() so an app update never loses progress.

import { dayNum } from './util.js';

export const STATE_VERSION = 1;
const KEY = 'fahm.state.v1';
const BACKUP_KEY = 'fahm.state.bak';

export function defaultState(today = dayNum()) {
  return {
    v: STATE_VERSION,
    created: today,
    onboarded: false,
    settings: {
      goalMin: 5,          // daily goal in minutes of practice
      newPerDay: 5,        // new words per daily session
      theme: 'auto',       // auto | light | dark
      script: 1,           // Arabic text size multiplier index (0..4)
      translit: true,      // show pronunciation help
      hints: 'unknown',    // all | unknown | none : word-by-word meanings under verse words
      tint: true,          // colour connecting words in the reader
      showTranslation: 'tap', // tap | always
      haptics: true,
      sound: false,
      audio: true,
      reciter: 'Alafasy_128kbps',
      reduceMotion: false,
      reminder: { on: false, h: 19, m: 0, nudge: false },
      focus: '',           // collection id the learner is working towards ('' = general path)
    },
    cards: {},             // id -> srs state
    daily: {},             // dayNum -> {sec, xp, n, ok, learned, sessions}
    streak: { count: 0, best: 0, last: -1, freezes: 1 },
    xp: 0,
    achievements: {},      // id -> dayNum earned
    passages: {},          // collection id -> dayNum completed
    versesRead: {},        // verse index -> times read (capstones + reader practice)
    stats: { answered: 0, correct: 0, sessions: 0, bestSpeed: 0 },
    lastOpen: today,
    lastRead: -1,          // verse index last opened in the reader
    updateCheck: { at: 0, tag: '' },
  };
}

export function migrate(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const d = defaultState(s.created ?? dayNum());
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.settings.reminder = { ...d.settings.reminder, ...((s.settings || {}).reminder || {}) };
  out.streak = { ...d.streak, ...(s.streak || {}) };
  out.stats = { ...d.stats, ...(s.stats || {}) };
  out.cards = s.cards || {};
  out.daily = s.daily || {};
  out.achievements = s.achievements || {};
  out.passages = s.passages || {};
  out.versesRead = s.versesRead || {};
  out.v = STATE_VERSION;
  return out;
}

export function loadState(storage) {
  for (const key of [KEY, BACKUP_KEY]) {
    try {
      const txt = storage.getItem(key);
      if (txt) return migrate(JSON.parse(txt));
    } catch (e) {
      // fall through to the backup copy
    }
  }
  return defaultState();
}

export function saveState(storage, state) {
  try {
    const txt = JSON.stringify(state);
    const prev = storage.getItem(KEY);
    if (prev) storage.setItem(BACKUP_KEY, prev);
    storage.setItem(KEY, txt);
    return true;
  } catch (e) {
    return false;
  }
}

/** A tiny observable store with a debounced save. */
export function createStore(storage, { saveDelay = 600 } = {}) {
  let state = loadState(storage);
  const listeners = new Set();
  let timer = null;
  const api = {
    get: () => state,
    set(next) {
      state = next;
      api.emit();
    },
    update(fn) {
      fn(state);
      api.emit();
    },
    emit() {
      listeners.forEach((l) => l(state));
      clearTimeout(timer);
      timer = setTimeout(api.flush, saveDelay);
      if (timer && timer.unref) timer.unref(); // never keep a Node test process alive
    },
    flush() {
      clearTimeout(timer);
      saveState(storage, state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}

// ---- backup codes ---------------------------------------------------------------------------

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Turn progress into a copy-and-paste text code. */
export async function exportCode(state) {
  const json = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream !== 'undefined') {
    return 'FAHM2:' + b64encode(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'FAHM1:' + b64encode(json);
}

export async function importCode(text) {
  const t = (text || '').trim().replace(/\s+/g, '');
  let json;
  if (t.startsWith('FAHM2:')) {
    json = new TextDecoder().decode(await pipe(b64decode(t.slice(6)), new DecompressionStream('deflate-raw')));
  } else if (t.startsWith('FAHM1:')) {
    json = new TextDecoder().decode(b64decode(t.slice(6)));
  } else {
    throw new Error('That does not look like a Fahm backup code.');
  }
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.cards) throw new Error('Backup code is damaged.');
  return migrate(parsed);
}
