import { html } from './h.js';

const P = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  path: 'M12 3v4M12 17v4M7 12h10M12 7.5a1 1 0 1 0 0 .01M12 16.5a1 1 0 1 0 0 .01M7 12a1 1 0 1 0 0 .01M17 12a1 1 0 1 0 0 .01',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  fwd: 'M9 5l7 7-7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  play: 'M8 5v14l11-7z',
  pause: 'M9 5v14M15 5v14',
  volume: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.01',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.5l1.3-6.5L2.5 9.4l6.6-.8z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  text: 'M4 7V5h16v2M12 5v14M9 19h6',
  download: 'M12 3v12M7 10l5 5 5-5M5 19h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
};

const FILLED = new Set(['play', 'star']);

export function Icon({ name, size, class: cls = '' }) {
  const fill = FILLED.has(name);
  return html`<svg class=${cls} viewBox="0 0 24 24" width=${size || 24} height=${size || 24} fill=${fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || ''} /></svg>`;
}

export function Flame({ size = 20 }) {
  return html`<svg viewBox="0 0 24 24" width=${size} height=${size} fill="currentColor" aria-hidden="true"><path d="M12 2.5c.6 3.2 3 4.8 4.4 7 1 1.6 1.6 3 1.6 4.5a6 6 0 0 1-12 0c0-2.1.9-3.7 2.2-5 .2 1.4.9 2.4 2 3-.2-3.4.4-6.3 1.8-9.5z"/></svg>`;
}
