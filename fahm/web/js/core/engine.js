// The learning engine: owns the learner's progress, plans sessions and records every answer.
// Pure logic (no DOM) so it can be exercised from Node tests.

import * as srs from './srs.js';
import { ACHIEVEMENTS } from './achievements.js';
import { VerseStore } from './verses.js';
import * as ex from './exercises.js';
import { collectionStats, coverage, knownMask, missingForVerse, verseStats, wordKnown } from './lexicon.js';
import { clamp, dayNum, pick, rng, shuffle } from './util.js';

// minutes per day -> how many new words a day feels right (the planner shrinks this when reviews pile up)
export const GOALS = {
  3: { new: 3, label: 'Light' },
  5: { new: 4, label: 'Regular' },
  10: { new: 7, label: 'Serious' },
  15: { new: 10, label: 'Intense' },
};

// rough seconds each kind of step takes; used to fit a session into the daily goal
const COST = { meet: 10, learn: 6, review: 5, match: 22, verse: 35, newCard: 28 };

export const XP = { meet: 2, learn: 5, review: 4, match: 10, verse: 15, session: 20, speed: 1 };

export class Engine {
  constructor(lex, store, io, { now = () => new Date(), random = Math.random } = {}) {
    this.lex = lex;
    this.store = store;
    this.now = now;
    this.random = random;
    this.verses = new VerseStore(io, lex);
    this._mask = null;
    this._stats = null;
    this._cov = null;
    this._known = 0;
  }

  get state() {
    return this.store.get();
  }

  today() {
    return dayNum(this.now());
  }

  // ------------------------------------------------------------------ cards & knowledge

  card(id) {
    return this.state.cards[id] || null;
  }

  ensure(id) {
    const cards = this.state.cards;
    return cards[id] || (cards[id] = srs.newCardState(this.today()));
  }

  touch() {
    this._mask = this._stats = this._cov = null;
  }

  mask() {
    if (!this._mask) {
      this._mask = knownMask(this.lex, this.state.cards, srs.isKnown);
      let n = 0;
      for (const id in this.state.cards) if (srs.isKnown(this.state.cards[id])) n++;
      this._known = n;
    }
    return this._mask;
  }

  knownCount() {
    this.mask();
    return this._known;
  }

  coverage() {
    if (this._cov === null) this._cov = coverage(this.lex, this.mask());
    return this._cov;
  }

  verseStats() {
    if (!this._stats) this._stats = verseStats(this.lex, this.mask());
    return this._stats;
  }

  readableVerseCount() {
    const { known, total } = this.verseStats();
    let n = 0;
    for (let i = 0; i < total.length; i++) if (known[i] === total[i]) n++;
    return n;
  }

  /** known/total words of one surah. */
  surahStats(surah) {
    const ch = this.lex.chapters[surah - 1];
    const { known, total } = this.verseStats();
    let k = 0;
    let t = 0;
    let full = 0;
    for (let a = 0; a < ch.v; a++) {
      k += known[ch.o + a];
      t += total[ch.o + a];
      if (known[ch.o + a] === total[ch.o + a]) full++;
    }
    return { known: k, total: t, fraction: t ? k / t : 0, readable: full, verses: ch.v };
  }

  /** known | learning | new - how well the learner knows the word at global word index ti. */
  wordState(ti) {
    const lex = this.lex;
    const mask = this.mask();
    const cards = this.state.cards;
    let all = true;
    let fresh = false;
    const check = (id) => {
      if (mask[id]) return;
      all = false;
      const c = cards[id];
      if (!(c && c.s === srs.STAGE_LEARNING)) fresh = true;
    };
    check(lex.prim[ti]);
    for (const x of lex.sets[lex.rset[ti]]) check(x);
    if (all) return 'known';
    return fresh ? 'new' : 'learning';
  }

  /** True for connecting words (particles, pronouns, demonstratives ...), tinted in the reader. */
  isConnecting(ti) {
    const c = this.lex.card(this.lex.prim[ti]);
    return !!c && (c.c === 'c' || c.c === 'r');
  }

  passageStats(col) {
    return collectionStats(this.lex, this.mask(), col);
  }

  // ------------------------------------------------------------------ progress

  dailyRecord(day = this.today()) {
    return this.state.daily[day] || { sec: 0, xp: 0, n: 0, ok: 0, learned: 0, sessions: 0 };
  }

  goalMinutes() {
    return this.state.settings.goalMin;
  }

  /**
   * The daily goal is met by finishing a session, or by practising for the chosen number of minutes.
   * (Sessions are sized to fit the goal, so a short day-one session is a full day.)
   */
  goalProgress(day = this.today()) {
    const r = this.dailyRecord(day);
    const minutes = r.sec / 60;
    const goal = this.goalMinutes();
    const done = r.sessions >= 1 || minutes >= goal - 0.01;
    return { minutes, goal, done, fraction: done ? 1 : Math.min(0.99, minutes / goal) };
  }

  /** What the streak flame shows today, taking freezes into account. */
  streakInfo() {
    const s = this.state.streak;
    const today = this.today();
    let count = s.count;
    let atRisk = false;
    if (s.last === today) {
      atRisk = false;
    } else if (s.last === today - 1) {
      atRisk = true;
    } else if (s.last >= 0) {
      const missed = today - 1 - s.last;
      if (missed <= s.freezes) atRisk = true;
      else count = 0;
    } else {
      count = 0;
    }
    return { count, best: s.best, atRisk, freezes: s.freezes, doneToday: s.last === today };
  }

  _registerGoalDay(today) {
    const s = this.state.streak;
    if (s.last === today) return false;
    if (s.last === today - 1) {
      s.count += 1;
    } else if (s.last >= 0 && today - 1 - s.last <= s.freezes) {
      s.freezes -= today - 1 - s.last;
      s.count += 1;
    } else {
      s.count = 1;
    }
    s.last = today;
    s.best = Math.max(s.best, s.count);
    if (s.count % 7 === 0) s.freezes = Math.min(2, s.freezes + 1);
    return true;
  }

  achievementContext(extra = {}) {
    const st = this.state;
    const mask = this.mask();
    const passages = Object.keys(st.passages).length;
    return {
      words: this.knownCount(),
      coverage: this.coverage(),
      readableVerses: this.readableVerseCount(),
      passages,
      passage: (id) => !!st.passages[id],
      streak: Math.max(st.streak.count, this.streakInfo().count),
      bestSpeed: st.stats.bestSpeed,
      perfect: !!extra.perfect,
      comeback: !!extra.comeback,
      mask,
    };
  }

  /** Returns achievements newly earned (and records them). */
  checkAchievements(extra = {}) {
    const ctx = this.achievementContext(extra);
    const earned = [];
    const today = this.today();
    for (const a of ACHIEVEMENTS) {
      if (this.state.achievements[a.id] === undefined && a.test(ctx)) {
        this.state.achievements[a.id] = today;
        earned.push(a);
      }
    }
    return earned;
  }

  /** Passages (surahs / verse sets) that became fully readable. */
  checkPassages() {
    const unlocked = [];
    const today = this.today();
    for (const col of this.lex.collections) {
      if (this.state.passages[col.id] !== undefined) continue;
      const st = this.passageStats(col);
      if (st.total && st.known === st.total) {
        this.state.passages[col.id] = today;
        unlocked.push(col);
      }
    }
    return unlocked;
  }

  /** The closest unfinished passage, for the home screen. */
  nextPassage() {
    let best = null;
    for (const col of this.lex.collections) {
      if (this.state.passages[col.id] !== undefined) continue;
      const st = this.passageStats(col);
      if (!st.missing.length) continue;
      const score = st.fraction - st.missing.length * 0.01;
      if (!best || score > best.score) best = { col, st, score };
    }
    const focus = this.state.settings.focus && this.lex.collectionById.get(this.state.settings.focus);
    if (focus && this.state.passages[focus.id] === undefined) {
      const st = this.passageStats(focus);
      if (st.missing.length) return { col: focus, st, score: 9, chosen: true };
    }
    return best;
  }

  // ------------------------------------------------------------------ path

  lessonStatus(lesson) {
    let started = 0;
    let done = 0;
    for (const id of lesson.cards) {
      const c = this.card(id);
      if (c && c.s >= srs.STAGE_LEARNING) started++;
      if (c && c.s === srs.STAGE_REVIEW) done++;
    }
    if (done === lesson.cards.length) return 'done';
    if (started > 0) return 'started';
    return 'todo';
  }

  currentLesson() {
    for (const l of this.lex.lessons) {
      if (l.cards.some((id) => !this.card(id) || this.card(id).s === srs.STAGE_NEW)) return l;
    }
    return null;
  }

  /** Next cards to teach, in path order (or the missing words of the passage being worked towards). */
  nextNewCards(n) {
    if (n <= 0) return [];
    const out = [];
    const focus = this.state.settings.focus && this.lex.collectionById.get(this.state.settings.focus);
    if (focus && this.state.passages[focus.id] === undefined) {
      const st = this.passageStats(focus);
      for (const id of st.missing) {
        const c = this.card(id);
        if (!c || c.s === srs.STAGE_NEW) out.push(id);
        if (out.length >= n) return out;
      }
    }
    const lesson = this.currentLesson();
    if (!lesson) return out;
    for (let li = this.lex.lessons.indexOf(lesson); li < this.lex.lessons.length && out.length < n; li++) {
      for (const id of this.lex.lessons[li].cards) {
        const c = this.card(id);
        if ((!c || c.s === srs.STAGE_NEW) && !out.includes(id)) out.push(id);
        if (out.length >= n) break;
      }
    }
    return out;
  }

  learningCards() {
    return Object.keys(this.state.cards).filter((id) => this.state.cards[id].s === srs.STAGE_LEARNING).map(Number);
  }

  dueCards(today = this.today()) {
    const list = [];
    for (const id in this.state.cards) {
      const c = this.state.cards[id];
      if (srs.isDue(c, today)) list.push({ id: Number(id), overdue: srs.overdueDays(c, today), level: srs.level(c), occ: this.lex.card(Number(id))?.o || 0 });
    }
    list.sort((a, b) => b.overdue - a.overdue || a.level - b.level || b.occ - a.occ);
    return list;
  }

  /** Spread an overwhelming backlog over the next week so coming back never feels like a mountain. */
  freshStart() {
    const today = this.today();
    const due = this.dueCards(today);
    const r = rng(today);
    due.forEach((d, i) => {
      const c = this.state.cards[d.id];
      c.d = today + (i % 7) + (r() < 0.3 ? 1 : 0);
    });
    this.touch();
    this.store.emit();
    return due.length;
  }

  introducedToday() {
    const today = this.today();
    let n = 0;
    for (const id in this.state.cards) if (this.state.cards[id].t === today) n++;
    return n;
  }

  // ------------------------------------------------------------------ session planning

  reviewStep(id) {
    const c = this.card(id);
    const lv = srs.level(c);
    const card = this.lex.card(id);
    const r = this.random();
    let kind;
    if (lv <= 2) kind = r < 0.5 ? 'a2e' : 'e2a';
    else if (lv === 3) kind = r < 0.35 ? 'ctx' : r < 0.55 && card.f && card.f.length > 1 ? 'form' : r < 0.8 ? 'a2e' : 'e2a';
    else kind = r < 0.35 ? 'ctx' : r < 0.55 ? 'cloze' : r < 0.75 && card.f && card.f.length > 1 ? 'form' : 'e2a';
    return { t: 'q', c: id, kind, role: 'review' };
  }

  /**
   * Reviews as steps. Young words get a question each; well-known words are bundled into quick
   * matching rounds (five words in about twenty seconds) with the odd in-verse question for variety.
   */
  reviewSteps(ids) {
    const young = [];
    const mature = [];
    for (const id of ids) {
      const lv = srs.level(this.card(id));
      if (lv >= 3 && this.lex.card(id).k !== 'p') mature.push(id);
      else young.push(id);
    }
    const out = young.map((id) => this.reviewStep(id));
    const rest = [];
    for (const id of mature) {
      if (this.random() < 0.22) out.push(this.reviewStep(id));
      else rest.push(id);
    }
    for (let i = 0; i < rest.length; i += 5) {
      const group = rest.slice(i, i + 5);
      if (group.length >= 3) out.push({ t: 'match', cs: group, role: 'review' });
      else group.forEach((id) => out.push(this.reviewStep(id)));
    }
    return out;
  }

  /** Steps that teach `ids` (meet, quiz, spaced second quiz) with `reviews` mixed in. */
  _teachingSteps(ids, reviews) {
    const out = [];
    const second = [];
    let ri = 0;
    ids.forEach((id, k) => {
      out.push({ t: 'meet', c: id });
      out.push({ t: 'q', c: id, kind: 'a2e', role: 'learn' });
      second.push({ t: 'q', c: id, kind: k % 2 ? 'ctx' : 'e2a', role: 'learn', alt: 'e2a' });
      if (second.length > 2) out.push(second.shift());
      if (k % 2 === 1 && ri < reviews.length) out.push(reviews[ri++]);
    });
    out.push(...second);
    out.push(...reviews.slice(ri));
    return out;
  }

  /** Verse to finish with: one the learner can fully read once the new words are known. */
  pickCapstone(newIds) {
    const lex = this.lex;
    const hyp = Uint8Array.from(this.mask());
    newIds.forEach((id) => (hyp[id] = 1));
    const seen = new Set();
    const cand = [];
    for (const id of newIds) {
      for (const vi of lex.versesWith(id).slice(0, 40)) {
        if (seen.has(vi)) continue;
        seen.add(vi);
        const n = lex.wordsIn(vi);
        if (n < 3 || n > 16) continue;
        let known = 0;
        for (let ti = lex.offsets[vi]; ti < lex.offsets[vi + 1]; ti++) if (wordKnown(lex, hyp, ti)) known++;
        if (known < n) continue;
        const read = this.state.versesRead[vi] || 0;
        const inPassage = lex.collections.some((c) => c.v.some(([s, a]) => lex.verseIndex(s, a) === vi));
        cand.push({ vi, score: (inPassage ? 6 : 0) - read * 5 - Math.abs(n - 7) * 0.4 + this.random() });
      }
    }
    cand.sort((a, b) => b.score - a.score);
    return cand.length ? cand[0].vi : null;
  }

  _finish(kind, title, steps, extra = {}) {
    let secs = 0;
    for (const st of steps) {
      if (st.t === 'meet') secs += COST.meet;
      else if (st.t === 'match') secs += COST.match;
      else if (st.t === 'verse') secs += COST.verse;
      else secs += st.role === 'learn' ? COST.learn : COST.review;
    }
    return { kind, title, steps, mins: Math.max(1, Math.round(secs / 60)), secs, ...extra };
  }

  /** A session that teaches specific cards (a lesson, a passage, a verse's missing words). */
  planLearn(newIds, { title = 'Lesson', extraReviews = 0, capstone = true, verses = [] } = {}) {
    const reviews = this.reviewSteps(this.dueCards().slice(0, extraReviews).map((d) => d.id));
    const steps = this._teachingSteps(newIds, reviews);
    if (newIds.length >= 3) steps.push({ t: 'match', cs: newIds.slice(0, 5), role: 'extra' });
    let cap = null;
    if (capstone) cap = verses.length ? verses[0] : this.pickCapstone(newIds);
    if (cap !== null && cap !== undefined) steps.push({ t: 'verse', v: cap });
    return this._finish('learn', title, steps, { newIds });
  }

  /**
   * The default "Today" session: reviews that are due + the next new words + a verse to read.
   * Sized to the daily goal; when many reviews are waiting, fewer new words are introduced.
   */
  planDaily({ bonus = false } = {}) {
    const s = this.state;
    const goal = GOALS[s.settings.goalMin] || GOALS[5];
    const budget = (bonus ? Math.max(120, s.settings.goalMin * 60 * 0.6) : s.settings.goalMin * 60) - COST.verse - COST.match;
    const due = this.dueCards().map((d) => d.id);
    // reviews first, but never more than ~55% of the time so new words keep flowing
    const reviewIds = [];
    let spent = 0;
    for (const id of due) {
      const cost = srs.level(this.card(id)) >= 3 ? COST.match / 5 : COST.review;
      if (spent + cost > budget * 0.55) break;
      reviewIds.push(id);
      spent += cost;
    }
    const learning = this.learningCards();
    const baseNew = bonus ? Math.max(3, Math.round(goal.new / 2)) : Math.max(0, goal.new - this.introducedToday());
    const affordable = Math.floor(Math.max(0, budget - spent) / COST.newCard);
    // a big backlog means: catch up first
    const backlogPenalty = due.length > reviewIds.length * 2 && due.length > 40 ? 0 : 1;
    let newN = Math.min(baseNew, Math.max(affordable, due.length ? 1 : baseNew)) * backlogPenalty;
    newN = Math.max(learning.length, newN);
    const fresh = this.nextNewCards(Math.max(0, newN - learning.length));
    const newIds = [...learning, ...fresh].slice(0, Math.max(newN, learning.length));
    const reviews = this.reviewSteps(reviewIds);
    // warm up with a couple of reviews before the first new word
    const warm = reviews.filter((r) => r.t === 'q').slice(0, 2);
    const warmSet = new Set(warm);
    const rest = reviews.filter((r) => !warmSet.has(r));
    const steps = [...warm, ...this._teachingSteps(newIds, rest)];
    if (newIds.length >= 3) steps.push({ t: 'match', cs: newIds.slice(0, 5), role: 'extra' });
    if (!steps.length) return this.planPractice();
    const capVerse = newIds.length ? this.pickCapstone(newIds) : null;
    if (capVerse !== null) steps.push({ t: 'verse', v: capVerse });
    return this._finish('daily', bonus ? 'Bonus round' : 'Today', steps, { newIds, dueCount: due.length });
  }

  /** Nothing is due and nothing is new: practise the shakiest known words. */
  planPractice(count = 12) {
    const ids = Object.keys(this.state.cards)
      .map(Number)
      .filter((id) => srs.isKnown(this.state.cards[id]))
      .sort((a, b) => srs.level(this.state.cards[a]) - srs.level(this.state.cards[b]) || this.random() - 0.5)
      .slice(0, count);
    const steps = ids.map((id) => this.reviewStep(id));
    if (ids.length >= 4) steps.push({ t: 'match', cs: ids.slice(0, 5), role: 'extra' });
    return this._finish('practice', 'Practice', steps, { newIds: [] });
  }

  planReview() {
    const due = this.dueCards().slice(0, Math.max(20, this.state.settings.goalMin * 8)).map((d) => d.id);
    if (!due.length) return this.planPractice();
    return this._finish('review', 'Review', this.reviewSteps(due), { newIds: [] });
  }

  planLesson(lessonId) {
    const lesson = this.lex.lessonById.get(lessonId);
    const todo = lesson.cards.filter((id) => !srs.isKnown(this.card(id) || { s: 0 }));
    if (!todo.length) {
      const steps = lesson.cards.map((id) => this.reviewStep(id));
      if (lesson.cards.length >= 3) steps.push({ t: 'match', cs: lesson.cards.slice(0, 5), role: 'extra' });
      return this._finish('practice', lesson.title, steps, { newIds: [] });
    }
    return this.planLearn(todo, { title: lesson.title });
  }

  /** Teach exactly the words still missing for a passage, then read it. */
  planPassage(colId) {
    const col = this.lex.collectionById.get(colId);
    const st = this.passageStats(col);
    const ids = st.missing.slice(0, 10);
    return this.planLearn(ids, { title: col.t, verses: [this.lex.verseIndex(...col.v[0])] });
  }

  /** Teach the words a single verse still needs, then read it. */
  planVerse(vi) {
    const ids = missingForVerse(this.lex, this.mask(), vi).slice(0, 8);
    if (!ids.length) return this._finish('read', 'Read', [{ t: 'verse', v: vi }], { newIds: [] });
    const s = this.lex.verseRef(vi);
    return this.planLearn(ids, { title: `Verse ${s[0]}:${s[1]}`, verses: [vi] });
  }

  // ------------------------------------------------------------------ prefetching & exercises

  /** Make sure the surah files needed by this plan are in memory. */
  async prepare(plan) {
    const need = new Set();
    for (const st of plan.steps) {
      if (st.t === 'verse') need.add(st.v);
      if (st.t === 'meet' || (st.t === 'q' && (st.kind === 'ctx' || st.kind === 'cloze' || st.alt === 'ctx'))) {
        for (const vi of this.lex.versesWith(st.c).slice(0, 12)) need.add(vi);
      }
    }
    await this.verses.preload([...need]);
  }

  /** A short verse that contains this word, for the "meet" card. */
  exampleFor(cardId) {
    const lex = this.lex;
    const card = lex.card(cardId);
    for (const vi of lex.versesWith(cardId)) {
      const n = lex.wordsIn(vi);
      if (n < 3 || n > 11) continue;
      const v = this.verses.peek(vi);
      if (!v) continue;
      let wi = -1;
      for (let t = lex.offsets[vi]; t < lex.offsets[vi + 1]; t++) {
        if (lex.prim[t] === cardId || lex.reqOf(t).includes(cardId)) {
          wi = t - lex.offsets[vi];
          break;
        }
      }
      if (wi >= 0) return { vi, wi, v, ref: lex.verseKey(vi) };
    }
    return card ? null : null;
  }

  buildExercise(step) {
    const rand = this.random;
    const lex = this.lex;
    if (step.t === 'match') return ex.makeMatch(lex, this, step.cs, rand);
    if (step.t === 'verse') return ex.makeVerseQuiz(lex, this, step.v, rand);
    const kind = step.kind;
    let q = null;
    if (kind === 'ctx') q = ex.makeContext(lex, this, step.c, rand);
    else if (kind === 'cloze') q = ex.makeCloze(lex, this, step.c, rand);
    else if (kind === 'form') q = ex.makeForm(lex, this, step.c, rand);
    if (!q) q = ex.makeMcq(lex, this, step.c, kind === 'e2a' || step.alt === 'e2a' ? 'e2a' : 'a2e', rand);
    return q;
  }

  // ------------------------------------------------------------------ recording answers

  addXp(n) {
    this.state.xp += n;
    return n;
  }

  /** Record an answer for a card. role: learn | review | retry. */
  recordCard(cardId, correct, { role = 'review', fast = false, session } = {}) {
    const today = this.today();
    const c = this.ensure(cardId);
    let graduated = false;
    if (role === 'learn') {
      srs.introduce(c, today);
      const ok = correct ? (session.learn.get(cardId) || 0) + 1 : 0;
      session.learn.set(cardId, ok);
      if (ok >= 2 && c.s !== srs.STAGE_REVIEW) {
        srs.graduate(c, today);
        graduated = true;
      }
    } else if (role === 'review') {
      if (c.s === srs.STAGE_REVIEW) srs.review(c, correct, today, { fast });
      else srs.introduce(c, today);
    }
    this.touch();
    return { graduated };
  }

  markKnown(cardId) {
    const c = this.ensure(cardId);
    srs.markKnown(c, this.today());
    this.touch();
    this.store.emit();
  }

  forget(cardId) {
    delete this.state.cards[cardId];
    this.touch();
    this.store.emit();
  }

  // ------------------------------------------------------------------ session lifecycle

  startSession(plan) {
    return new Session(this, plan);
  }

  addActivity({ sec = 0, xp = 0, n = 0, ok = 0, learned = 0, sessions = 0 }) {
    const today = this.today();
    const d = this.state.daily[today] || (this.state.daily[today] = { sec: 0, xp: 0, n: 0, ok: 0, learned: 0, sessions: 0 });
    d.sec += sec;
    d.xp += xp;
    d.n += n;
    d.ok += ok;
    d.learned += learned;
    d.sessions += sessions;
    // keep roughly a year of history
    const keys = Object.keys(this.state.daily);
    if (keys.length > 420) for (const k of keys.sort((a, b) => a - b).slice(0, keys.length - 400)) delete this.state.daily[k];
  }

  // ------------------------------------------------------------------ misc helpers for the UI

  verseOfTheDay() {
    const { known, total } = this.verseStats();
    const day = this.today();
    const cands = [];
    for (let vi = 0; vi < total.length; vi++) {
      if (total[vi] >= 5 && total[vi] <= 14 && known[vi] === total[vi]) cands.push(vi);
    }
    if (!cands.length) return null;
    return cands[(day * 2654435761) % cands.length >>> 0] ?? cands[0];
  }

  /** Friendly reminder texts (the Android app rotates through them). */
  reminderMessages() {
    const info = this.streakInfo();
    const np = this.nextPassage();
    const due = this.dueCards().length;
    const msgs = [
      { t: 'Five minutes with the Quran’s words?', b: 'A short session keeps what you learned fresh.' },
      { t: 'Your words are waiting', b: due ? `${due} word${due === 1 ? '' : 's'} ready to review.` : 'New words are ready for you today.' },
      { t: 'Read a little more today', b: `You can already read ${Math.round(this.coverage() * 100)}% of the Quran’s words.` },
    ];
    if (np) msgs.push({ t: `${np.col.t} is within reach`, b: `${np.st.missing.length} more word${np.st.missing.length === 1 ? '' : 's'} to understand every verse.` });
    if (info.count >= 2) msgs.push({ t: `Keep your ${info.count}-day streak`, b: 'One short session is all it takes.' });
    msgs.push({ t: 'Little and often', b: 'Two minutes is enough to keep going.' });
    return msgs;
  }
}

/** One run through a list of steps. */
export class Session {
  constructor(engine, plan) {
    this.e = engine;
    this.plan = plan;
    this.queue = plan.steps.map((s) => ({ ...s }));
    this.pos = 0;
    this.total = this.queue.length;
    this.learn = new Map();
    this.stats = { correct: 0, wrong: 0, xp: 0, sec: 0, learned: [], reviewed: 0, retried: 0, matchDone: 0, versesRead: 0 };
    this.coverageBefore = engine.coverage();
    this.readableBefore = engine.readableVerseCount();
    this.stepStart = 0;
    this.wrongCards = new Set();
    this.retries = new Map();
    this.finished = false;
  }

  get step() {
    return this.queue[this.pos] || null;
  }

  get progress() {
    return this.total ? this.pos / this.total : 1;
  }

  begin(nowMs = Date.now()) {
    this.stepStart = nowMs;
  }

  /** Called when the learner answers (or finishes viewing) the current step. */
  answer(result, nowMs = Date.now()) {
    const e = this.e;
    const step = this.step;
    const ms = Math.min(20000, Math.max(0, nowMs - this.stepStart));
    this.stats.sec += ms / 1000;
    const out = { xp: 0, graduated: false, correct: !!result.correct };
    if (step.t === 'meet') {
      const c = e.ensure(step.c);
      srs.introduce(c, e.today());
      out.xp = e.addXp(XP.meet);
      if (result.alreadyKnown) {
        e.markKnown(step.c);
        // drop the learn quizzes for this card
        this.queue = this.queue.filter((s, i) => i <= this.pos || !(s.t === 'q' && s.c === step.c && s.role === 'learn'));
        this.total = Math.min(this.total, this.queue.length);
        this.stats.learned.push(step.c);
      }
    } else if (step.t === 'q') {
      const correct = !!result.correct;
      if (correct) this.stats.correct++;
      else this.stats.wrong++;
      const fast = correct && ms < 3500;
      if (step.role === 'learn') {
        const { graduated } = e.recordCard(step.c, correct, { role: 'learn', fast, session: this });
        out.graduated = graduated;
        if (graduated) this.stats.learned.push(step.c);
        out.xp = e.addXp(correct ? XP.learn : 0);
      } else if (step.role === 'review') {
        e.recordCard(step.c, correct, { role: 'review', fast, session: this });
        this.stats.reviewed++;
        out.xp = e.addXp(correct ? XP.review : 0);
      } else {
        out.xp = e.addXp(correct ? 2 : 0);
      }
      if (!correct) {
        this.wrongCards.add(step.c);
        const n = this.retries.get(step.c) || 0;
        if (n < 2) {
          this.retries.set(step.c, n + 1);
          const at = Math.min(this.queue.length, this.pos + 3 + n);
          this.queue.splice(at, 0, { t: 'q', c: step.c, kind: n === 0 ? (step.kind === 'a2e' ? 'e2a' : 'a2e') : 'a2e', role: step.role === 'learn' ? 'learn' : 'retry' });
          this.total++;
          this.stats.retried++;
        }
      }
      e.state.stats.answered++;
      if (correct) e.state.stats.correct++;
    } else if (step.t === 'match') {
      const bad = new Set(result.wrongIds || []);
      const pairs = result.pairs || step.cs.length;
      this.stats.correct += pairs;
      this.stats.wrong += bad.size;
      out.xp = e.addXp(bad.size <= 1 ? XP.match : 5);
      this.stats.matchDone++;
      if (step.role === 'review') {
        for (const id of step.cs) {
          const c = e.card(id);
          if (c && c.s === srs.STAGE_REVIEW) srs.review(c, !bad.has(id), e.today());
          if (bad.has(id)) this.wrongCards.add(id);
        }
        this.stats.reviewed += step.cs.length;
      }
    } else if (step.t === 'verse') {
      const vi = step.v;
      e.state.versesRead[vi] = (e.state.versesRead[vi] || 0) + 1;
      this.stats.versesRead++;
      if (result.correct) this.stats.correct++;
      else this.stats.wrong++;
      out.xp = e.addXp(result.correct ? XP.verse : 6);
    }
    this.stats.xp += out.xp;
    e.touch();
    e.store.emit();
    this.pos++;
    this.stepStart = nowMs;
    return out;
  }

  get done() {
    return this.pos >= this.queue.length;
  }

  /** Close the session: bank XP, time, streak and achievements. Returns what to celebrate. */
  finish({ completed = true } = {}) {
    if (this.finished) return this.summary;
    this.finished = true;
    const e = this.e;
    const st = this.stats;
    const answered = st.correct + st.wrong;
    const bonus = completed && answered > 0 ? e.addXp(XP.session) : 0;
    st.xp += bonus;
    const counts = completed && (answered >= 5 || st.learned.length >= 2 || st.versesRead > 0);
    e.addActivity({ sec: st.sec, xp: st.xp, n: answered, ok: st.correct, learned: st.learned.length, sessions: counts ? 1 : 0 });
    if (completed) e.state.stats.sessions++;
    const goalBefore = e.state.streak.last === e.today();
    let streakExtended = false;
    if (e.goalProgress().done && !goalBefore) streakExtended = e._registerGoalDay(e.today());
    const lastOpen = e.state.lastOpen;
    const perfect = completed && st.wrong === 0 && answered >= 8;
    const comeback = e.today() - (e.state.prevOpen ?? lastOpen) >= 7;
    e.touch();
    const unlocked = e.checkPassages();
    const achievements = e.checkAchievements({ perfect, comeback });
    this.summary = {
      completed,
      xp: st.xp,
      sec: st.sec,
      accuracy: answered ? st.correct / answered : 1,
      answered,
      learned: st.learned,
      reviewed: st.reviewed,
      versesRead: st.versesRead,
      coverageBefore: this.coverageBefore,
      coverageAfter: e.coverage(),
      newReadable: e.readableVerseCount() - this.readableBefore,
      streakExtended,
      streak: e.streakInfo(),
      goal: e.goalProgress(),
      unlocked,
      achievements,
    };
    e.store.emit();
    e.store.flush();
    return this.summary;
  }
}
