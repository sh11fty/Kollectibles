// Small shared helpers (pure, no DOM access so they run in Node tests too).

export const DAY_MS = 86400000;
const ROLLOVER_HOURS = 3; // the "learning day" ticks over at 03:00 so late-night study still counts for today

/** Whole local "learning day" number for a Date (or now). */
export function dayNum(date = new Date()) {
  const t = date.getTime() - date.getTimezoneOffset() * 60000 - ROLLOVER_HOURS * 3600000;
  return Math.floor(t / DAY_MS);
}

/** yyyy-mm-dd for a day number. */
export function dayStr(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** Small, fast seeded random number generator (mulberry32). */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rand = Math.random) {
  return arr[Math.floor(rand() * arr.length)];
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Arabic text without vowel marks, for loose matching / search. */
export function stripMarks(s) {
  return (s || '').replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

/** English word set of a meaning, used to keep multiple-choice distractors distinct from the answer. */
export function meaningWords(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'for', 'his', 'her', 'its', 'one'].includes(w)),
  );
}

export function overlaps(a, b) {
  const A = meaningWords(a);
  for (const w of meaningWords(b)) if (A.has(w)) return true;
  return false;
}

export function pluralize(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(x, digits = 0) {
  const f = 10 ** digits;
  return Math.round(x * 100 * f) / f;
}

/** Gloss text from the word-by-word data -> [{t, implied}] so "(of) Allah" renders as faint "of" + "Allah". */
export function glossParts(g) {
  const out = [];
  const re = /\(([^)]*)\)|\[([^\]]*)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(g))) {
    if (m.index > last) out.push({ t: g.slice(last, m.index), implied: false });
    out.push({ t: m[1] ?? m[2], implied: true });
    last = m.index + m[0].length;
  }
  if (last < g.length) out.push({ t: g.slice(last), implied: false });
  return out.filter((p) => p.t.trim() !== '');
}
