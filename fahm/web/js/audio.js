// Streams word and verse recitation from public CDNs. Everything else in the app works offline.

const pad = (n, w = 3) => String(n).padStart(w, '0');

export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'Mishary Alafasy' },
  { id: 'Husary_128kbps', name: 'Mahmoud Khalil Al-Husary (slow, clear)' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Mohamed Siddiq Al-Minshawi' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit Abdus-Samad' },
];

export const wordUrl = (s, a, w) => `https://audio.qurancdn.com/wbw/${pad(s)}_${pad(a)}_${pad(w)}.mp3`;
export const verseUrl = (reciter, s, a) => `https://everyayah.com/data/${reciter}/${pad(s)}${pad(a)}.mp3`;

let el = null;
let current = null;
const listeners = new Set();

function emit() { listeners.forEach((l) => l(current)); }

export function onAudio(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function stopAudio() {
  if (el) { el.pause(); el.removeAttribute('src'); }
  current = null;
  emit();
}

/** Play a URL. Resolves true when playback started, false when it could not (offline etc.). */
export async function playAudio(url, key = url) {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', () => { current = null; emit(); });
    el.addEventListener('error', () => { current = null; emit(); });
  }
  if (current === key) { stopAudio(); return true; }
  el.pause();
  el.src = url;
  current = key;
  emit();
  try {
    await el.play();
    return true;
  } catch (e) {
    current = null;
    emit();
    return false;
  }
}

export const playingKey = () => current;
