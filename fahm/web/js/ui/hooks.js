import { useEffect, useState } from './h.js';

/** Verse data (Arabic words, meanings, translation) loaded lazily; null until available. */
export function useVerse(engine, vi) {
  const [d, setD] = useState(() => engine.verses.peek(vi));
  useEffect(() => {
    let on = true;
    setD(engine.verses.peek(vi));
    engine.verses.verse(vi).then((x) => on && setD(x));
    return () => { on = false; };
  }, [vi]);
  return d;
}

export function useSurah(engine, n) {
  const [d, setD] = useState(() => engine.verses.cache.get(n) || null);
  useEffect(() => {
    let on = true;
    setD(engine.verses.cache.get(n) || null);
    engine.verses.surah(n).then((x) => on && setD(x));
    return () => { on = false; };
  }, [n]);
  return d;
}

/** Reading options the verse renderer needs. */
export const readerOpts = (s) => ({ hints: s.hints, tint: s.tint, translit: s.translit });

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
