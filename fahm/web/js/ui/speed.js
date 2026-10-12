// Speed round: 60 seconds, as many words as you can. A wrong answer costs three seconds.
import { html, useEffect, useRef, useState } from './h.js';
import { useApp } from './ctx.js';
import { useBack } from './back.js';
import { Icon } from './icons.js';
import { Confetti, useTimer } from './components.js';
import { makeMcq } from '../core/exercises.js';
import { shuffle } from '../core/util.js';
import { dayStr } from '../core/util.js';
import { platform } from '../platform.js';

const DURATION = 60;
const PENALTY = 3;

export function SpeedRound({ onClose }) {
  const app = useApp();
  const { engine, lex } = app;
  const [phase, setPhase] = useState('ready');
  const [left, setLeft] = useState(DURATION);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(0);
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(-1);
  const [result, setResult] = useState(null);
  const queue = useRef([]);
  const lock = useRef(false);
  const ended = useRef(false);
  const known = engine.knownIds();
  const best = engine.state.stats.bestSpeed;

  useBack(() => { onClose(); return true; });
  useEffect(() => () => platform.keepScreenOn(false), []);

  const next = () => {
    if (!queue.current.length) queue.current = shuffle(known, engine.random);
    const id = queue.current.pop();
    const nq = makeMcq(lex, engine, id, engine.random() < 0.7 ? 'a2e' : 'e2a', engine.random);
    if (window.__fahmTest) window.__fahmTest.ex = nq;
    setQ(nq);
    setPicked(-1);
    lock.current = false;
  };

  const start = () => {
    queue.current = [];
    ended.current = false;
    setScore(0);
    setMiss(0);
    setLeft(DURATION);
    setPhase('play');
    platform.keepScreenOn(true);
    next();
  };

  const end = (finalScore, finalMiss) => {
    if (ended.current) return;
    ended.current = true;
    platform.keepScreenOn(false);
    const r = engine.recordSpeed({ score: finalScore, miss: finalMiss, sec: DURATION });
    if (engine.goalProgress().done) platform.goalDone(dayStr(engine.today()), engine.streakInfo().count);
    app.syncReminder();
    setResult({ ...r, score: finalScore, miss: finalMiss });
    setPhase('over');
    app.fx(r.newBest ? 'big' : 'ok');
  };

  useTimer(phase === 'play', () => setLeft((l) => l - 1));
  useEffect(() => {
    if (phase === 'play' && left <= 0) end(score, miss);
  }, [left, phase]);

  const pick = (i) => {
    if (lock.current || !q) return;
    lock.current = true;
    setPicked(i);
    if (i === q.answer) {
      setScore(score + 1);
      app.fx('ok');
      setTimeout(next, 220);
    } else {
      setMiss(miss + 1);
      setLeft((l) => Math.max(0, l - PENALTY));
      app.fx('bad');
      setTimeout(next, 650);
    }
  };

  const ar = q && q.dir === 'e2a';
  const cls = (i) => (picked < 0 ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : '');

  if (phase === 'ready') {
    return html`<div class="session">
      <div class="sbar"><button class="iconbtn" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button></div>
      <div class="sbody"><div class="fill center stack">
        <div class="big-emoji">⚡</div>
        <div class="h1">Speed round</div>
        <div class="muted">${DURATION} seconds. Pick the meaning as fast as you can.<br />A wrong answer costs ${PENALTY} seconds.</div>
        ${best ? html`<div class="chip gold" style=${{ alignSelf: 'center' }}>Your best: ${best}</div>` : null}
        ${known.length < 6
          ? html`<div class="card soft">Learn a few more words first — this round uses words you already know.</div>`
          : html`<button class="btn primary big" onClick=${start}>Start</button>`}
      </div></div>
    </div>`;
  }

  if (phase === 'over') {
    return html`<div class="session">
      <${Confetti} run=${result.newBest} />
      <div class="sbody"><div class="fill center stack">
        <div class="big-emoji glow">${result.newBest ? '🏆' : '⚡'}</div>
        <div class="bigpct">${result.score}</div>
        <div class="h2">${result.newBest ? 'New best!' : 'words in 60 seconds'}</div>
        <div class="muted">${result.miss ? `${result.miss} missed · ` : 'No misses · '}best ${result.best}</div>
        ${result.achievements.map((a) => html`<div class="ach"><div class="e">${a.icon}</div><div style=${{ textAlign: 'left' }}><div class="bold">${a.title}</div><div class="small muted">${a.desc}</div></div></div>`)}
        <div class="stack-sm"><button class="btn primary big block" onClick=${start}>Go again</button><button class="btn ghost block" onClick=${onClose}>Done</button></div>
      </div></div>
    </div>`;
  }

  return html`<div class="session">
    <div class="sbar">
      <button class="iconbtn" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button>
      <div class="grow"><div class="bar"><i style=${{ width: (Math.max(0, left) / DURATION) * 100 + '%', transition: 'width 1s linear', background: left <= 10 ? 'var(--rose)' : undefined }}></i></div></div>
      <span class="timer">${Math.max(0, left)}</span>
    </div>
    <div class="sbody" key=${q ? q.cardId + ':' + score + ':' + miss : 'x'}>
      ${q
        ? html`<div class="fill">
            <div class="row" style=${{ justifyContent: 'center', gap: '8px' }}><span class="chip soft">${score} correct</span></div>
            <div class="center" style=${{ margin: '12px 0 22px' }}>
              ${q.prompt.ar ? html`<div class="ar ar-xl" lang="ar">${q.prompt.ar}</div>` : html`<div class="meaning" style=${{ fontSize: '32px', padding: '18px 0' }}>${q.prompt.en}</div>`}
            </div>
            <div class="opts ${ar ? 'two' : ''}">
              ${q.options.map((o, i) => html`<button class="opt ${o.ar ? 'ar-opt' : ''} ${cls(i)}" lang=${o.ar ? 'ar' : 'en'} onClick=${() => pick(i)}>${o.ar || o.text}</button>`)}
            </div>
          </div>`
        : null}
    </div>
  </div>`;
}
