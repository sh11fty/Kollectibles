// Spaced repetition: when does each word come back?
//
// Each card keeps: s (stage 0 new / 1 learning / 2 review), e (ease), i (interval in days),
// d (day number it is due), r (successful reviews), l (lapses), t (day first met), x (last seen day).
// Designed for people who study a little each day: small early steps, a gentle ease, and no
// "ease hell" - a missed card simply returns tomorrow.

import { clamp, rng } from './util.js';

export const STAGE_NEW = 0;
export const STAGE_LEARNING = 1;
export const STAGE_REVIEW = 2;

const EARLY_STEPS = [1, 3, 7, 14]; // days after the 1st, 2nd, 3rd, 4th successful review
const MAX_INTERVAL = 365;
const jitter = rng(12345);

export function newCardState(today) {
  return { s: STAGE_NEW, e: 2.3, i: 0, d: today, r: 0, l: 0, t: 0, x: 0 };
}

export function introduce(card, today) {
  if (card.s === STAGE_NEW) {
    card.s = STAGE_LEARNING;
    card.t = today;
  }
  card.x = today;
  return card;
}

/** Finish the learning phase: the learner answered correctly twice in the first session. */
export function graduate(card, today, { known = false } = {}) {
  card.s = STAGE_REVIEW;
  card.r = known ? 2 : 1;
  card.i = known ? 7 : 1;
  card.d = today + card.i;
  card.x = today;
  if (!card.t) card.t = today;
  return card;
}

/** Apply one answer to a card that is already in the review stage. */
export function review(card, correct, today, { fast = false } = {}) {
  card.x = today;
  if (!correct) {
    card.l += 1;
    card.e = clamp(card.e - 0.2, 1.3, 3);
    card.r = Math.max(0, card.r - 1);
    card.i = 1;
    card.d = today + 1;
    return card;
  }
  card.r += 1;
  let ivl;
  if (card.r <= EARLY_STEPS.length) {
    ivl = Math.max(EARLY_STEPS[card.r - 1], Math.round(card.i * 1.5));
  } else {
    ivl = Math.round(card.i * card.e * (fast ? 1.1 : 1));
  }
  if (fast) card.e = clamp(card.e + 0.03, 1.3, 2.8);
  ivl = clamp(Math.round(ivl * (0.95 + jitter() * 0.1)), 1, MAX_INTERVAL);
  card.i = ivl;
  card.d = today + ivl;
  return card;
}

/** The learner says "I already know this": skip straight to a longer interval. */
export function markKnown(card, today) {
  return graduate(card, today, { known: true });
}

export function isDue(card, today) {
  return card.s === STAGE_REVIEW && card.d <= today;
}

export function overdueDays(card, today) {
  return Math.max(0, today - card.d);
}

/** 0 new, 1 learning, 2 young (<7d), 3 growing (<30d), 4 strong (<90d), 5 mastered. */
export function level(card) {
  if (!card || card.s === STAGE_NEW) return 0;
  if (card.s === STAGE_LEARNING) return 1;
  if (card.i < 7) return 2;
  if (card.i < 30) return 3;
  if (card.i < 90) return 4;
  return 5;
}

export const LEVEL_NAMES = ['New', 'Learning', 'Fresh', 'Growing', 'Strong', 'Mastered'];

/** A word counts as "known" for reading once it has graduated. */
export function isKnown(card) {
  return !!card && card.s === STAGE_REVIEW;
}
