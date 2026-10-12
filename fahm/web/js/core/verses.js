// Lazy loader for the per-surah text files (Arabic words, word-by-word meanings, translation).

export class VerseStore {
  constructor(io, lex) {
    this.io = io;
    this.lex = lex;
    this.cache = new Map();
    this.pending = new Map();
  }

  surah(n) {
    if (this.cache.has(n)) return Promise.resolve(this.cache.get(n));
    if (!this.pending.has(n)) {
      const p = this.io.json(`data/quran/${String(n).padStart(3, '0')}.json`).then((d) => {
        this.cache.set(n, d);
        this.pending.delete(n);
        return d;
      });
      this.pending.set(n, p);
    }
    return this.pending.get(n);
  }

  /** Verse data if its surah is already loaded, else null. */
  peek(vi) {
    const [s, a] = this.lex.verseRef(vi);
    const d = this.cache.get(s);
    return d ? d.v[a - 1] : null;
  }

  async verse(vi) {
    const [s, a] = this.lex.verseRef(vi);
    const d = await this.surah(s);
    return d.v[a - 1];
  }

  /** Make sure the surahs for these verse indexes are in memory. */
  async preload(verseIndexes) {
    const surahs = new Set(verseIndexes.map((vi) => this.lex.verseRef(vi)[0]));
    await Promise.all([...surahs].map((s) => this.surah(s)));
  }
}
