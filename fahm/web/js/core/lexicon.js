// The word list, the learning path and a compact index of every word in the Quran.
// Pure logic: works in the browser and in Node tests (data comes in through an `io` object).

export const CAT_FUNCTION = new Set(['c', 'r', 'b']);

export class Lexicon {
  static async load(io) {
    const [lex, path, meta, buf] = await Promise.all([
      io.json('data/lex.json'),
      io.json('data/path.json'),
      io.json('data/meta.json'),
      io.bin('data/vidx.bin'),
    ]);
    return new Lexicon(lex, path, meta, buf);
  }

  constructor(lex, path, meta, buf) {
    this.version = lex.v;
    this.cardList = lex.cards;
    this.cards = new Map(lex.cards.map((c) => [c.i, c]));
    this.maxId = Math.max(...lex.cards.map((c) => c.i));
    this.sets = lex.sets;
    this.units = path.units;
    this.collections = path.collections;
    this.chapters = meta.chapters;
    this.verseCount = meta.verses;
    this.tokenCount = meta.tokens;

    // binary token index: header, verse offsets, primary card per word, requirement-set per word
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'FV01') throw new Error('bad token index');
    const nv = dv.getUint32(4, true);
    const nt = dv.getUint32(8, true);
    this.offsets = new Uint32Array(buf.slice(12, 12 + 4 * (nv + 1)));
    const p0 = 12 + 4 * (nv + 1);
    this.prim = new Uint16Array(buf.slice(p0, p0 + 2 * nt));
    this.rset = new Uint16Array(buf.slice(p0 + 2 * nt, p0 + 4 * nt));

    // path order
    this.lessons = [];
    this.lessonOfCard = new Map();
    this.pathOrder = []; // card ids in teaching order
    this.units.forEach((u, ui) => {
      u.l.forEach((l, li) => {
        const lesson = { id: l.id, title: l.t, cards: l.c, unit: ui, index: li, unitId: u.id };
        this.lessons.push(lesson);
        for (const c of l.c) {
          if (!this.lessonOfCard.has(c)) {
            this.lessonOfCard.set(c, lesson);
            this.pathOrder.push(c);
          }
        }
      });
    });
    this.lessonById = new Map(this.lessons.map((l) => [l.id, l]));
    this.collectionById = new Map(this.collections.map((c) => [c.id, c]));
    this._cardVerses = null;
    this._groups = null;
  }

  card(id) {
    return this.cards.get(id);
  }

  // ---- verses ----
  verseIndex(s, a) {
    return this.chapters[s - 1].o + a - 1;
  }

  /** [surah, ayah] for a global verse index. */
  verseRef(vi) {
    let lo = 0;
    let hi = this.chapters.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.chapters[mid].o <= vi) lo = mid;
      else hi = mid - 1;
    }
    return [this.chapters[lo].n, vi - this.chapters[lo].o + 1];
  }

  verseKey(vi) {
    const [s, a] = this.verseRef(vi);
    return `${s}:${a}`;
  }

  wordsIn(vi) {
    return this.offsets[vi + 1] - this.offsets[vi];
  }

  /** Cards needed to understand the word at global word index ti. */
  reqOf(ti) {
    const extra = this.sets[this.rset[ti]];
    return extra.length ? [this.prim[ti], ...extra] : [this.prim[ti]];
  }

  /** Verse indexes in which a card is needed, shortest verses first. */
  versesWith(cardId) {
    if (!this._cardVerses) this._buildCardVerses();
    return this._cardVerses.get(cardId) || [];
  }

  _buildCardVerses() {
    const map = new Map();
    for (let vi = 0; vi < this.verseCount; vi++) {
      for (let ti = this.offsets[vi]; ti < this.offsets[vi + 1]; ti++) {
        const ids = this.sets[this.rset[ti]];
        add(this.prim[ti]);
        for (const x of ids) add(x);
      }
      function add(id) {
        let arr = map.get(id);
        if (!arr) map.set(id, (arr = []));
        if (arr[arr.length - 1] !== vi) arr.push(vi);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => this.wordsIn(a) - this.wordsIn(b) || a - b);
    this._cardVerses = map;
  }

  /** Cards grouped by kind of word, ordered by frequency, for picking look-alike wrong answers. */
  groups() {
    if (!this._groups) {
      const g = { fn: [], content: [] };
      const inPath = new Set(this.pathOrder);
      for (const c of this.cardList) {
        if (!inPath.has(c.i) || !c.e) continue;
        (CAT_FUNCTION.has(c.c) ? g.fn : g.content).push(c);
      }
      g.fn.sort((a, b) => b.o - a.o);
      g.content.sort((a, b) => b.o - a.o);
      this._groups = g;
    }
    return this._groups;
  }
}

/** Uint8Array flag per card id: 1 when the learner has graduated the card. */
export function knownMask(lex, cardStates, isKnown) {
  const mask = new Uint8Array(lex.maxId + 2);
  for (const id in cardStates) if (isKnown(cardStates[id])) mask[id] = 1;
  return mask;
}

export function wordKnown(lex, mask, ti) {
  if (!mask[lex.prim[ti]]) return false;
  const extra = lex.sets[lex.rset[ti]];
  for (let k = 0; k < extra.length; k++) if (!mask[extra[k]]) return false;
  return true;
}

/** Share of all Quran words the learner can read (0..1). */
export function coverage(lex, mask) {
  let ok = 0;
  for (let ti = 0; ti < lex.tokenCount; ti++) if (wordKnown(lex, mask, ti)) ok++;
  return ok / lex.tokenCount;
}

/** known/total word counts for every verse. */
export function verseStats(lex, mask) {
  const known = new Uint16Array(lex.verseCount);
  const total = new Uint16Array(lex.verseCount);
  for (let vi = 0; vi < lex.verseCount; vi++) {
    let k = 0;
    const lo = lex.offsets[vi];
    const hi = lex.offsets[vi + 1];
    for (let ti = lo; ti < hi; ti++) if (wordKnown(lex, mask, ti)) k++;
    known[vi] = k;
    total[vi] = hi - lo;
  }
  return { known, total };
}

export function collectionVerses(lex, col) {
  return col.v.map(([s, a]) => lex.verseIndex(s, a));
}

/** Progress through a hand-picked passage. */
export function collectionStats(lex, mask, col) {
  const vis = collectionVerses(lex, col);
  let known = 0;
  let total = 0;
  const missing = new Map();
  let readableVerses = 0;
  for (const vi of vis) {
    let vk = 0;
    const lo = lex.offsets[vi];
    const hi = lex.offsets[vi + 1];
    for (let ti = lo; ti < hi; ti++) {
      total++;
      if (wordKnown(lex, mask, ti)) {
        known++;
        vk++;
      } else {
        for (const id of lex.reqOf(ti)) if (!mask[id]) missing.set(id, (missing.get(id) || 0) + 1);
      }
    }
    if (vk === hi - lo) readableVerses++;
  }
  const missingCards = [...missing.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
  return { known, total, fraction: total ? known / total : 0, missing: missingCards, verses: vis.length, readableVerses };
}

/** Unknown cards a verse still needs, most useful first. */
export function missingForVerse(lex, mask, vi) {
  const out = [];
  const seen = new Set();
  for (let ti = lex.offsets[vi]; ti < lex.offsets[vi + 1]; ti++) {
    for (const id of lex.reqOf(ti)) {
      if (!mask[id] && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}
