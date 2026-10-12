// Guards for the generated data (web/data): rebuilding it must never silently break the app or reassign cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { io, loadLexicon, makeEngine } from './helpers.js';
import { collectionStats, coverage, knownMask } from '../web/js/core/lexicon.js';
import * as srs from '../web/js/core/srs.js';

test('every surah file matches the token index', async () => {
  const lex = await loadLexicon();
  let tokens = 0;
  for (let n = 1; n <= 114; n++) {
    const d = await io.json(`data/quran/${String(n).padStart(3, '0')}.json`);
    assert.equal(d.s, n);
    assert.equal(d.v.length, lex.chapters[n - 1].v, `surah ${n} verse count`);
    d.v.forEach((v, a) => {
      const vi = lex.chapters[n - 1].o + a;
      assert.equal(v.w.length, lex.wordsIn(vi), `${n}:${a + 1} word count`);
      assert.ok(v.t && v.t.length > 3, `${n}:${a + 1} translation`);
      for (const w of v.w) {
        assert.ok(w[0] && typeof w[1] === 'string', `${n}:${a + 1} word shape`);
        for (const [text, id] of w[4] || []) {
          assert.equal(typeof text, 'string'); // may be empty when the corpus has an elided letter
          assert.ok(id === 0 || lex.card(id), `${n}:${a + 1} piece card ${id}`); // 0 = part of the previous piece's card
        }
      }
      tokens += v.w.length;
    });
  }
  assert.equal(tokens, lex.tokenCount);
});

test('every word points at real cards', async () => {
  const lex = await loadLexicon();
  assert.ok(lex.cardList.length > 4000);
  for (let ti = 0; ti < lex.tokenCount; ti++) {
    for (const id of lex.reqOf(ti)) assert.ok(lex.cards.has(id), `token ${ti} needs card ${id}`);
  }
  for (const c of lex.cardList) {
    assert.ok(c.i > 0 && c.i < 65536, `card id ${c.i} fits the 16-bit index`);
    assert.ok(c.a, `card ${c.i} has Arabic`);
  }
  assert.equal(new Set(lex.cardList.map((c) => c.i)).size, lex.cardList.length, 'card ids are unique');
});

test('lessons, units and passages only use existing material', async () => {
  const lex = await loadLexicon();
  assert.equal(lex.units.length, 44);
  assert.ok(lex.lessons.length > 200);
  for (const l of lex.lessons) {
    assert.ok(l.cards.length > 0, `lesson ${l.id} is empty`);
    for (const id of l.cards) assert.ok(lex.card(id) && lex.card(id).e, `lesson ${l.id} card ${id}`);
  }
  for (const u of lex.units) if (u.g) assert.ok(lex.collectionById.has(u.g), `unit ${u.id} goal ${u.g}`);
  for (const col of lex.collections) {
    assert.ok(col.v.length > 0, `${col.id} has verses`);
    for (const [s, a] of col.v) {
      assert.ok(a >= 1 && a <= lex.chapters[s - 1].v, `${col.id} verse ${s}:${a}`);
    }
  }
});

test('the curriculum keeps its promises', async () => {
  const lex = await loadLexicon();
  const mask = new Uint8Array(lex.maxId + 2);
  // learning the first unit makes Al-Fatiha fully readable
  for (const l of lex.lessons.filter((x) => x.unit === 0)) for (const id of l.cards) mask[id] = 1;
  const fatiha = collectionStats(lex, mask, lex.collectionById.get('fatiha'));
  assert.equal(fatiha.known, fatiha.total, 'Al-Fatiha is readable after unit 1');
  assert.ok(lex.lessons.filter((x) => x.unit === 0).reduce((n, l) => n + l.cards.length, 0) <= 40, 'unit 1 stays small');
  // the whole path reads about 90% of the Quran
  for (const id of lex.pathOrder) mask[id] = 1;
  assert.ok(coverage(lex, mask) > 0.88, 'full path coverage');
  // every passage becomes readable somewhere along the path
  for (const col of lex.collections) {
    const st = collectionStats(lex, mask, col);
    assert.ok(st.fraction > 0.9, `${col.id} is ${Math.round(st.fraction * 100)}% readable after the whole path`);
  }
});

test('knowing a verse means knowing all of its pieces', async () => {
  const { engine, lex } = await makeEngine();
  // "bismi" = bi + ism: knowing only the prefix does not make the word known
  const vi = lex.verseIndex(1, 1);
  const ti = lex.offsets[vi];
  const need = lex.reqOf(ti);
  assert.ok(need.length >= 2);
  engine.markKnown(need[0]);
  assert.equal(engine.wordState(ti), 'new');
  for (const id of need.slice(1)) engine.markKnown(id);
  assert.equal(engine.wordState(ti), 'known');
  const mask = knownMask(lex, engine.state.cards, srs.isKnown);
  assert.ok(coverage(lex, mask) > 0);
});
