import { html, useEffect, useRef, useState } from './h.js';
import { Icon } from './icons.js';
import { useBack } from './back.js';
import { glossParts } from '../core/util.js';
import { LEVEL_NAMES } from '../core/srs.js';

export function Ring({ value = 0, size = 64, stroke = 8, gold = false, children, class: cls = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return html`<div class="ring ${gold ? 'gold' : ''} ${cls}" style=${{ width: size + 'px', height: size + 'px' }}>
    <svg width=${size} height=${size}>
      <circle class="bg" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke-width=${stroke} />
      <circle class="fg" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke-width=${stroke} stroke-dasharray=${c} stroke-dashoffset=${off} />
    </svg>
    <div class="lbl">${children}</div>
  </div>`;
}

export function Bar({ value = 0, gold = false, thin = false }) {
  return html`<div class="bar ${gold ? 'gold' : ''} ${thin ? 'thin' : ''}"><i style=${{ width: Math.max(0, Math.min(1, value)) * 100 + '%' }}></i></div>`;
}

export function Switch({ on, onChange, label }) {
  return html`<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked=${on} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
}

export function Sheet({ onClose, children }) {
  useBack(() => { onClose(); return true; });
  return html`<div class="backdrop" onClick=${onClose}></div>
    <div class="sheet" role="dialog"><div class="grab"></div>${children}</div>`;
}

/** A small coloured dot for how well a word is known: known / learning / new. */
export function StateDot({ state }) {
  return html`<span class="sdot ${state}" title=${state}></span>`;
}

export function Gloss({ g }) {
  return glossParts(g || '').map((p, i) => (p.implied ? html`<i key=${i}>${p.t} </i>` : html`<span key=${i}>${p.t}</span>`));
}

export function LevelDots({ level }) {
  return html`<div class="lvl" title=${LEVEL_NAMES[level]}>${[1, 2, 3, 4, 5].map((i) => html`<i class=${i <= level ? 'on' : ''}></i>`)}</div>`;
}

const CAT_NAME = { c: 'connecting word', r: 'pronoun', b: 'little piece', n: 'noun', v: 'verb', a: 'describing word', p: 'name' };
export const catName = (c) => CAT_NAME[c] || 'word';

export function CatTag({ c }) {
  return html`<span class="tag ${c}">${catName(c)}</span>`;
}

/**
 * A verse as tappable words. `data` = per-surah verse entry {t, w}. Words carry their learning state so the
 * learner can see at a glance what they know.
 */
export function VerseWords({ vi, data, engine, opts, onWord, target = -1, gap = -1, conceal = -1, center = false, compact = false, peek = null }) {
  const lex = engine.lex;
  const t0 = lex.offsets[vi];
  const hints = opts.hints;
  return html`<div class="verse ${center ? 'center' : ''} ${compact ? 'compact' : ''}" lang="ar">
    ${data.w.map((w, i) => {
      const ti = t0 + i;
      const st = engine.wordState(ti);
      const conn = opts.tint && engine.isConnecting(ti);
      const open = peek && peek.has(i);
      const showGloss = ((hints === 'all' ? true : hints === 'unknown' ? st !== 'known' : false) && i !== conceal) || open;
      const isGap = i === gap;
      return html`<span class="wrap" key=${i}>
        <button class="w ${st} ${conn ? 'conn' : ''} ${i === target ? 'target' : ''} ${isGap ? 'gap' : ''} ${open ? 'open' : ''}" onClick=${() => onWord(i, ti, w)}>
          <span class="a">${isGap ? '\u00a0' : w[0]}</span>
          ${showGloss && !isGap ? html`<span class="g"><${Gloss} g=${w[1]} /></span>` : null}
          ${opts.translit && showGloss && !isGap ? html`<span class="tr">${w[2]}</span>` : null}
        </button>
        ${w[3] ? html`<span class="sign-only">${w[3]}</span>` : null}
      </span>`;
    })}
  </div>`;
}

export function useTimer(active, onTick) {
  const cb = useRef(onTick);
  cb.current = onTick;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => cb.current(), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function Confetti({ run, count = 90 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!run) return undefined;
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const W = (cv.width = cv.offsetWidth * devicePixelRatio);
    const H = (cv.height = cv.offsetHeight * devicePixelRatio);
    const colors = ['#0f6b4f', '#b9811a', '#45c496', '#e6b44e', '#2b66ad', '#bf4a44'];
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.4, r: (4 + Math.random() * 6) * devicePixelRatio,
      vx: (Math.random() - 0.5) * 3 * devicePixelRatio, vy: (2 + Math.random() * 4) * devicePixelRatio,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0],
    }));
    let raf;
    let t = 0;
    const tick = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05 * devicePixelRatio; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.6); ctx.restore();
      });
      if (t < 220) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return html`<canvas ref=${ref} class="confetti"></canvas>`;
}

export function ScreenTitle({ title, sub, right }) {
  return html`<div class="row" style=${{ padding: '2px 2px 6px' }}>
    <div class="grow"><div class="h1">${title}</div>${sub ? html`<div class="muted small">${sub}</div>` : null}</div>${right}
  </div>`;
}

export function BackBar({ title, onBack, right }) {
  return html`<div class="topbar">
    <button class="iconbtn" onClick=${onBack} aria-label="Back"><${Icon} name="back" /></button>
    <div class="title">${title}</div>
    <div style=${{ minWidth: '42px' }}>${right}</div>
  </div>`;
}

const AR_RUN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u200c\u200d\u060c ]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

/** English text that contains Arabic words: the Arabic runs get the Quran font and correct direction. */
export function Rich({ text }) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let m;
  AR_RUN.lastIndex = 0;
  while ((m = AR_RUN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(html`<span class="ar-inline" lang="ar" dir="rtl">${m[0]}</span>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
