// Builds the questions the learner sees. Everything here returns plain objects; the UI just renders them.

import { overlaps, pick, shuffle } from './util.js';
import { CAT_FUNCTION } from './lexicon.js';

const OPTION_COUNT = 4;

/** Wrong answers that look like the right one: same kind of word, similar frequency, different meaning. */
export function distractors(lex, engine, card, n, rand, { byMeaning = true } = {}) {
  const g = lex.groups();
  const list = CAT_FUNCTION.has(card.c) ? g.fn : g.content;
  // position of the target among its peers by frequency (peers are sorted by frequency)
  let at = list.findIndex((c) => c.i === card.i);
  if (at < 0) at = Math.min(list.length - 1, Math.floor(list.length / 4));
  const window = [];
  const lo = Math.max(0, at - 70);
  const hi = Math.min(list.length, at + 70);
  for (let i = lo; i < hi; i++) {
    const c = list[i];
    if (c.i === card.i) continue;
    if (byMeaning && (c.e === card.e || overlaps(c.e, card.e))) continue;
    if (!byMeaning && c.a === card.a) continue;
    window.push(c);
  }
  // prefer words the learner has already met, so options are not total strangers
  const met = window.filter((c) => engine.card(c.i));
  const pool = shuffle(met.length >= n * 2 ? met : window, rand);
  const out = [];
  for (const c of pool) {
    if (out.some((o) => (byMeaning ? o.e === c.e || overlaps(o.e, c.e) : o.a === c.a))) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function cut(text, max = 46) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Arabic -> meaning (a2e) or meaning -> Arabic (e2a). */
export function makeMcq(lex, engine, cardId, dir, rand) {
  const card = lex.card(cardId);
  const wrong = distractors(lex, engine, card, OPTION_COUNT - 1, rand, { byMeaning: true });
  const opts = shuffle([card, ...wrong], rand);
  return {
    type: 'mcq',
    dir,
    cardId,
    prompt: dir === 'a2e' ? { ar: card.a, tr: card.t } : { en: card.e },
    heading: dir === 'a2e' ? 'What does this mean?' : 'Which word means this?',
    options: opts.map((c) => (dir === 'a2e' ? { id: c.i, text: cut(c.e) } : { id: c.i, ar: c.a })),
    answer: opts.findIndex((c) => c.i === cardId),
    card,
  };
}

/** The word inside a real verse: "what does the highlighted word mean here?". */
export function makeContext(lex, engine, cardId, rand, { maxWords = 12 } = {}) {
  const card = lex.card(cardId);
  if (card.k !== 'l') return null;
  const mask = engine.mask();
  let best = null;
  const cands = lex.versesWith(cardId).slice(0, 60);
  for (const vi of cands) {
    const n = lex.wordsIn(vi);
    if (n < 3 || n > maxWords) continue;
    const v = engine.verses.peek(vi);
    if (!v) continue;
    // find the word whose primary card is this card
    let ti = -1;
    for (let t = lex.offsets[vi]; t < lex.offsets[vi + 1]; t++) {
      if (lex.prim[t] === cardId) {
        ti = t;
        break;
      }
    }
    if (ti < 0) continue;
    let known = 0;
    for (let t = lex.offsets[vi]; t < lex.offsets[vi + 1]; t++) if (t !== ti && lex.reqOf(t).every((id) => mask[id])) known++;
    const score = known / (n - 1) + rand() * 0.15 - n * 0.01;
    if (!best || score > best.score) best = { vi, ti, score, v };
  }
  if (!best) return null;
  const wi = best.ti - lex.offsets[best.vi];
  const word = best.v.w[wi];
  const wrong = distractors(lex, engine, card, OPTION_COUNT - 1, rand, { byMeaning: true });
  const opts = shuffle([card, ...wrong], rand);
  return {
    type: 'ctx',
    cardId,
    verse: best.vi,
    wordIndex: wi,
    words: best.v.w,
    translation: best.v.t,
    heading: 'What does the highlighted word mean here?',
    gloss: word[1],
    options: opts.map((c) => ({ id: c.i, text: cut(c.e) })),
    answer: opts.findIndex((c) => c.i === cardId),
    card,
  };
}

/** Fill the gap in a short verse. */
export function makeCloze(lex, engine, cardId, rand, opts = {}) {
  const ctx = makeContext(lex, engine, cardId, rand, { maxWords: opts.maxWords ?? 9 });
  if (!ctx) return null;
  const card = ctx.card;
  const wrong = distractors(lex, engine, card, OPTION_COUNT - 1, rand, { byMeaning: false });
  const options = shuffle([card, ...wrong], rand);
  return {
    ...ctx,
    type: 'cloze',
    heading: 'Which word fits the gap?',
    hint: ctx.gloss,
    options: options.map((c) => ({ id: c.i, ar: c.a })),
    answer: options.findIndex((c) => c.i === cardId),
  };
}

/** A real word-shape (e.g. قُلْ) and its meaning. */
export function makeForm(lex, engine, cardId, rand) {
  const card = lex.card(cardId);
  if (!card.f || card.f.length < 2) return null;
  const [ar, en] = pick(card.f, rand);
  // wrong answers: meanings of forms of other cards of the same kind
  const g = lex.groups();
  const list = (CAT_FUNCTION.has(card.c) ? g.fn : g.content).filter((c) => c.f && c.f.length && c.i !== cardId);
  const wrong = [];
  for (const c of shuffle(list, rand)) {
    const f = pick(c.f, rand);
    if (f[1].toLowerCase() === en.toLowerCase() || overlaps(f[1], en)) continue;
    if (wrong.some((w) => w.text.toLowerCase() === f[1].toLowerCase())) continue;
    wrong.push({ id: c.i, text: cut(f[1]) });
    if (wrong.length === OPTION_COUNT - 1) break;
  }
  if (wrong.length < OPTION_COUNT - 1) return null;
  const options = shuffle([{ id: cardId, text: cut(en) }, ...wrong], rand);
  return {
    type: 'mcq',
    dir: 'form',
    cardId,
    prompt: { ar, tr: '' },
    heading: `A form of ${card.a} - what does it mean?`,
    options,
    answer: options.findIndex((o) => o.id === cardId && o.text === cut(en)),
    card,
    note: `${ar} = ${en}`,
  };
}

/** Five Arabic / meaning pairs to match. */
export function makeMatch(lex, engine, cardIds, rand) {
  const cards = cardIds.map((id) => lex.card(id));
  const seen = new Set();
  const pairs = [];
  for (const c of cards) {
    if (seen.has(c.e)) continue;
    seen.add(c.e);
    pairs.push({ id: c.i, ar: c.a, en: cut(c.e, 30) });
  }
  return {
    type: 'match',
    cardIds: pairs.map((p) => p.id),
    heading: 'Match the pairs',
    left: shuffle(pairs.map((p) => ({ id: p.id, ar: p.ar })), rand),
    right: shuffle(pairs.map((p) => ({ id: p.id, en: p.en })), rand),
  };
}

/** Pick the best translation of a verse from three. */
export function makeVerseQuiz(lex, engine, vi, rand) {
  const v = engine.verses.peek(vi);
  if (!v || !v.t) return null;
  const [s] = lex.verseRef(vi);
  const own = engine.verses.cache.get(s);
  const target = lex.wordsIn(vi);
  const pool = [];
  for (let i = 0; i < own.v.length; i++) {
    const other = own.v[i];
    if (!other.t || other.t === v.t) continue;
    pool.push({ t: other.t, d: Math.abs(other.w.length - target) });
  }
  if (pool.length < 2) {
    for (const [n, d] of engine.verses.cache) {
      if (n === s) continue;
      for (const other of d.v) if (other.t && Math.abs(other.w.length - target) < 5) pool.push({ t: other.t, d: 3 });
      if (pool.length > 30) break;
    }
  }
  pool.sort((a, b) => a.d - b.d);
  const near = shuffle(pool.slice(0, 12), rand).slice(0, 2);
  if (near.length < 2) return null;
  const options = shuffle([{ text: v.t, ok: true }, ...near.map((n) => ({ text: n.t, ok: false }))], rand);
  return {
    type: 'verse',
    verse: vi,
    words: v.w,
    translation: v.t,
    heading: 'Which one is the meaning of this verse?',
    options,
    answer: options.findIndex((o) => o.ok),
  };
}
