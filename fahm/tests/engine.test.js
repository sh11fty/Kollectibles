import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine, playPlan } from './helpers.js';
import * as srs from '../web/js/core/srs.js';

test('data loads and is consistent', async () => {
  const { lex } = await makeEngine();
  assert.equal(lex.verseCount, 6236);
  assert.equal(lex.tokenCount, 77429);
  assert.equal(lex.chapters.length, 114);
  assert.deepEqual(lex.verseRef(0), [1, 1]);
  assert.deepEqual(lex.verseRef(6235), [114, 6]);
  assert.equal(lex.verseIndex(2, 255), lex.chapters[1].o + 254);
  // every path card exists and has a meaning
  for (const id of lex.pathOrder) {
    const c = lex.card(id);
    assert.ok(c, `card ${id}`);
    assert.ok(c.a && c.e, `card ${id} needs display + meaning`);
  }
});

test('a brand new learner starts with Al-Fatiha words', async () => {
  const { engine, lex } = await makeEngine();
  assert.equal(engine.coverage(), 0);
  const plan = engine.planDaily();
  assert.equal(plan.kind, 'daily');
  assert.equal(plan.newIds.length, 4);
  const first = lex.lessons[0];
  assert.deepEqual(plan.newIds, first.cards.slice(0, 4));
  // teaching steps: meet + quiz for each new card, ending with a verse when one is readable
  assert.equal(plan.steps.filter((s) => s.t === 'meet').length, 4);
  assert.ok(plan.steps.some((s) => s.t === 'q' && s.role === 'learn'));
});

test('a perfect first session graduates the new words and raises coverage', async () => {
  const { engine } = await makeEngine();
  const plan = engine.planDaily();
  const sum = await playPlan(engine, plan);
  assert.ok(sum.completed);
  assert.ok(sum.learned.length >= 3, `learned ${sum.learned.length}`);
  assert.ok(engine.knownCount() >= 3);
  assert.equal(sum.accuracy, 1);
  assert.ok(sum.xp > 20);
  assert.equal(engine.state.stats.sessions, 1);
  for (const id of sum.learned) assert.equal(engine.card(id).s, srs.STAGE_REVIEW);
});

test('wrong answers are retried and do not graduate a card early', async () => {
  const { engine } = await makeEngine();
  const plan = engine.planDaily();
  await engine.prepare(plan);
  const session = engine.startSession(plan);
  session.begin(0);
  // meet card 0
  assert.equal(session.step.t, 'meet');
  const id = session.step.c;
  session.answer({}, 1000);
  assert.equal(session.step.t, 'q');
  const before = session.queue.length;
  session.answer({ correct: false }, 2000);
  assert.equal(session.queue.length, before + 1, 'a retry step is queued');
  assert.equal(engine.card(id).s, srs.STAGE_LEARNING);
});

test('reviews come back the next day and intervals grow', async () => {
  const { engine, advance } = await makeEngine();
  await playPlan(engine, engine.planDaily());
  assert.equal(engine.dueCards().length, 0);
  advance(1);
  const due = engine.dueCards();
  assert.ok(due.length >= 3);
  const plan = engine.planDaily();
  assert.ok(plan.steps.some((s) => s.t === 'q' && s.role === 'review'));
  await playPlan(engine, plan);
  const id = due[0].id;
  assert.ok(engine.card(id).i >= 3, 'second success schedules at least 3 days');
});

test('streak counts goal days and survives a freeze', async () => {
  const { engine, advance } = await makeEngine();
  engine.state.settings.goalMin = 3;
  const sessionOf = async () => {
    // pretend the learner practised for 4 minutes
    engine.addActivity({ sec: 240 });
    engine.state.stats.sessions++;
    const s = engine.startSession({ steps: [] });
    return s.finish();
  };
  await sessionOf();
  assert.equal(engine.streakInfo().count, 1);
  advance(1);
  assert.equal(engine.streakInfo().atRisk, true);
  await sessionOf();
  assert.equal(engine.streakInfo().count, 2);
  advance(2); // missed exactly one day, one freeze available
  assert.equal(engine.streakInfo().count, 2);
  await sessionOf();
  assert.equal(engine.streakInfo().count, 3);
  advance(5); // missed several days, no freeze left
  assert.equal(engine.streakInfo().count, 0);
});

test('passages unlock when every word is known', async () => {
  const { engine, lex } = await makeEngine();
  const col = lex.collectionById.get('fatiha');
  let guard = 0;
  while (engine.passageStats(col).missing.length && guard++ < 6) {
    const sum = await playPlan(engine, engine.planPassage('fatiha'));
    assert.ok(sum.completed);
  }
  assert.equal(engine.passageStats(col).missing.length, 0);
  assert.equal(engine.passageStats(col).fraction, 1);
  engine.checkPassages();
  assert.ok(engine.state.passages.fatiha !== undefined);
  // and Al-Fatiha verses are now fully readable
  const { known, total } = engine.verseStats();
  for (let a = 0; a < 7; a++) assert.equal(known[a], total[a]);
});

test('exercises: options are unique and contain the answer', async () => {
  const { engine, lex } = await makeEngine();
  engine.mask();
  for (const id of lex.pathOrder.slice(0, 300)) {
    for (const kind of ['a2e', 'e2a']) {
      const q = engine.buildExercise({ t: 'q', c: id, kind, role: 'review' });
      assert.equal(q.type, 'mcq');
      assert.equal(q.options.length, 4, `card ${id} ${kind}`);
      const texts = q.options.map((o) => o.text || o.ar);
      assert.equal(new Set(texts).size, 4, `duplicate options for ${lex.card(id).a}: ${texts}`);
      assert.equal(q.options[q.answer].id, id);
    }
  }
});
