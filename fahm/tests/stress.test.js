// Shake the engine: weeks of irregular use with every kind of session, mistakes and long breaks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine, playPlan } from './helpers.js';
import * as srs from '../web/js/core/srs.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

async function plan(engine, kind, rand) {
  switch (kind) {
    case 'daily': return engine.planDaily();
    case 'quick': return engine.planDaily({ quick: true });
    case 'bonus': return engine.planDaily({ bonus: true });
    case 'review': return engine.planReview();
    case 'practice': return engine.planPractice();
    case 'lesson': return engine.planLesson(engine.lex.lessons[Math.floor(rand() * engine.lex.lessons.length)].id);
    case 'passage': return engine.planPassage(engine.lex.collections[Math.floor(rand() * engine.lex.collections.length)].id);
    default: return engine.planVerse(Math.floor(rand() * engine.lex.verseCount));
  }
}

test('weeks of irregular practice never break the engine', async () => {
  const { engine, advance, lex } = await makeEngine({ seed: 7 });
  const rand = lcg(99);
  const kinds = ['daily', 'daily', 'daily', 'quick', 'bonus', 'review', 'practice', 'lesson', 'passage', 'verse'];
  let lastCoverage = 0;
  let sessions = 0;
  for (let day = 0; day < 60; day++) {
    // 1 in 5 days is skipped; now and then a long break
    const gap = rand() < 0.08 ? 3 + Math.floor(rand() * 9) : rand() < 0.2 ? 1 : 0;
    if (gap) advance(gap);
    if (gap >= 6 && engine.dueCards().length > 30) engine.freshStart();
    const n = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const kind = kinds[Math.floor(rand() * kinds.length)];
      const p = await plan(engine, kind, rand);
      assert.ok(p && Array.isArray(p.steps), `${kind} returns a plan`);
      if (!p.steps.length) continue;
      const sum = await playPlan(engine, p, { pWrong: 0.05 + rand() * 0.3, rand });
      sessions++;
      assert.ok(sum.xp >= 0 && sum.accuracy >= 0 && sum.accuracy <= 1);
      assert.ok(sum.coverageAfter >= sum.coverageBefore - 1e-9, 'coverage never falls');
    }
    const cov = engine.coverage();
    assert.ok(cov >= lastCoverage - 1e-9, 'coverage is monotonic');
    lastCoverage = cov;
    advance(1);
  }
  assert.ok(sessions > 40);
  // invariants on the stored state
  const st = engine.state;
  for (const [id, c] of Object.entries(st.cards)) {
    assert.ok(lex.card(Number(id)), `card ${id} exists`);
    assert.ok([srs.STAGE_NEW, srs.STAGE_LEARNING, srs.STAGE_REVIEW].includes(c.s));
    assert.ok(Number.isFinite(c.d) && Number.isFinite(c.e) && c.e >= 1.3 && c.e <= 3);
    if (c.s === srs.STAGE_REVIEW) assert.ok(c.i >= 1 && c.i <= 365, `interval ${c.i}`);
  }
  assert.ok(st.streak.count >= 0 && st.streak.best >= st.streak.count);
  assert.ok(st.streak.freezes >= 0 && st.streak.freezes <= 2);
  assert.ok(engine.knownCount() > 20, `known ${engine.knownCount()}`);
  // the saved state survives a round trip
  const copy = JSON.parse(JSON.stringify(st));
  assert.equal(Object.keys(copy.cards).length, Object.keys(st.cards).length);
});

test('a returning learner is eased back in, not buried', async () => {
  const { engine, advance } = await makeEngine({ seed: 3 });
  for (let d = 0; d < 12; d++) {
    await playPlan(engine, engine.planDaily());
    advance(1);
  }
  advance(40); // a long break
  const due = engine.dueCards().length;
  assert.ok(due > 20, `a pile of ${due} words is waiting`);
  const p = engine.planDaily();
  assert.ok(p.steps.length < 60, `the comeback session stays short (${p.steps.length} steps)`);
  const spread = engine.freshStart();
  assert.equal(spread, due);
  assert.ok(engine.dueCards().length < due, 'fresh start moves reviews into the coming week');
});
