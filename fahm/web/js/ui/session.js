// A study session: one step at a time (meet a word, answer a question, match pairs, read a verse), then a summary.
import { html, useEffect, useRef, useState } from './h.js';
import { useApp } from './ctx.js';
import { useBack } from './back.js';
import { Icon, Flame } from './icons.js';
import { Bar, CatTag, Confetti, Gloss, Rich, Sheet, VerseWords } from './components.js';
import { AudioButton } from './sheets.js';
import { dayStr, pct, pluralize } from '../core/util.js';
import { verseUrl } from '../audio.js';
import { platform } from '../platform.js';

const PRAISE = ['Correct!', 'Nice!', 'Exactly!', 'Well done!', 'You got it!', 'Spot on!'];
const KIND_HINT = {
  p: 'A tiny piece that sticks to the front of the next word.',
  r: 'A pronoun. It appears alone and also stuck to the end of other words.',
  d: 'Points at something: this, that, those.',
};

const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------------------------ steps

function MeetStep({ ex, settings, engine, onKnown }) {
  const { card, example } = ex;
  const lex = engine.lex;
  const hint = KIND_HINT[card.k];
  return html`<div class="fill stack">
    <div class="meet-card">
      <div class="row" style=${{ justifyContent: 'center', position: 'relative' }}><span class="caps">New word</span> <${CatTag} c=${card.c} /></div>
      <div class="ar ar-xl" lang="ar">${card.a}</div>
      ${settings.translit ? html`<div class="muted" style=${{ position: 'relative' }}>${card.t}</div>` : null}
      <div class="meaning" style=${{ position: 'relative' }}>${card.e}</div>
      ${hint ? html`<div class="small muted" style=${{ marginTop: '8px', position: 'relative' }}>${hint}</div>` : null}
    </div>
    ${card.x ? html`<div class="note"><${Rich} text=${card.x} /></div>` : null}
    ${card.f && card.f.length > 1
      ? html`<div class="forms">${card.f.slice(0, 4).map((f) => html`<div class="form-chip"><span class="ar" lang="ar">${f[0]}</span><span>${f[1]}</span></div>`)}</div>`
      : null}
    ${example
      ? html`<div class="example">
          <div class="caps" style=${{ marginBottom: '4px' }}>In the Quran · ${example.ref}</div>
          <${VerseWords} vi=${example.vi} data=${example.v} engine=${engine} opts=${{ hints: 'all', tint: false, translit: false }} target=${example.wi} center=${true} onWord=${() => {}} />
          <div class="small muted" style=${{ marginTop: '4px' }}>${example.v.t}</div>
        </div>`
      : null}
    <button class="btn ghost" onClick=${onKnown}>I already know this word</button>
  </div>`;
}

function ChoiceStep({ ex, res, onPick, settings }) {
  const ar = ex.dir === 'e2a';
  const cls = (i) => (res ? (i === ex.answer ? 'right' : i === res.picked ? 'wrong' : '') : '');
  return html`<div class="fill">
    <div class="caps center">${ex.heading}</div>
    <div class="center" style=${{ marginTop: '14px' }}>
      ${ex.prompt.ar
        ? html`<div class="ar ar-xl" lang="ar">${ex.prompt.ar}</div>${settings.translit && ex.prompt.tr ? html`<div class="muted">${ex.prompt.tr}</div>` : null}`
        : html`<div class="meaning" style=${{ fontSize: '32px', padding: '18px 0' }}>${ex.prompt.en}</div>`}
    </div>
    <div class="opts ${ar ? 'two' : ''}">
      ${ex.options.map((o, i) => html`<button class="opt ${o.ar ? 'ar-opt' : ''} ${cls(i)}" lang=${o.ar ? 'ar' : 'en'} disabled=${!!res} onClick=${() => onPick(i)}>${o.ar || o.text}</button>`)}
    </div>
  </div>`;
}

function ContextStep({ ex, res, onPick, engine }) {
  const cloze = ex.type === 'cloze';
  const ar = cloze;
  const cls = (i) => (res ? (i === ex.answer ? 'right' : i === res.picked ? 'wrong' : '') : '');
  return html`<div class="fill">
    <div class="caps center">${ex.heading}</div>
    <div class="card verse-card" style=${{ marginTop: '14px' }}>
      <${VerseWords} vi=${ex.verse} data=${{ w: ex.words }} engine=${engine} opts=${{ hints: 'all', tint: false, translit: false }}
        target=${cloze ? -1 : ex.wordIndex} gap=${cloze && !res ? ex.wordIndex : -1} conceal=${res ? -1 : ex.wordIndex} center=${true} compact=${true} onWord=${() => {}} />
      ${cloze && !res && ex.hint ? html`<div class="center small muted">Hint: ${ex.hint}</div>` : null}
      ${res ? html`<div class="small muted center sel" style=${{ marginTop: '6px' }}>${ex.translation}</div>` : null}
    </div>
    <div class="opts ${ar ? 'two' : ''}">
      ${ex.options.map((o, i) => html`<button class="opt ${o.ar ? 'ar-opt' : ''} ${cls(i)}" lang=${o.ar ? 'ar' : 'en'} disabled=${!!res} onClick=${() => onPick(i)}>${o.ar || o.text}</button>`)}
    </div>
  </div>`;
}

function MatchStep({ ex, onDone, settings }) {
  const [sel, setSel] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const [flash, setFlash] = useState(null);
  const wrong = useRef(new Set());
  const total = ex.cardIds.length;

  const tap = (side, id) => {
    if (done.has(id) || flash) return;
    if (!sel || sel.side === side) {
      setSel({ side, id });
      return;
    }
    const l = side === 'l' ? id : sel.id;
    const r = side === 'r' ? id : sel.id;
    if (l === r) {
      const next = new Set(done).add(l);
      setDone(next);
      setSel(null);
      if (next.size === total) setTimeout(() => onDone({ correct: true, pairs: total, wrongIds: [...wrong.current] }), 450);
    } else {
      wrong.current.add(l);
      setFlash({ l, r });
      setSel(null);
      setTimeout(() => setFlash(null), 520);
    }
  };

  const cls = (side, id) => {
    if (done.has(id)) return 'right';
    if (flash && ((side === 'l' && flash.l === id) || (side === 'r' && flash.r === id))) return 'wrong';
    if (sel && sel.side === side && sel.id === id) return 'picked';
    return '';
  };
  return html`<div class="fill">
    <div class="caps center">${ex.heading}</div>
    <div class="match">
      <div class="col">${ex.left.map((o) => html`<button class="opt ar-opt ${cls('l', o.id)}" lang="ar" key=${o.id} data-id=${o.id} disabled=${done.has(o.id)} onClick=${() => tap('l', o.id)}>${o.ar}</button>`)}</div>
      <div class="col">${ex.right.map((o) => html`<button class="opt ${cls('r', o.id)}" key=${o.id} data-id=${o.id} disabled=${done.has(o.id)} onClick=${() => tap('r', o.id)}>${o.en}</button>`)}</div>
    </div>
    <div class="center muted small" style=${{ marginTop: '14px' }}>${done.size} of ${total} matched</div>
  </div>`;
}

function VerseStep({ ex, res, onPick, engine, settings }) {
  const [peek, setPeek] = useState(() => new Set());
  const lex = engine.lex;
  const [s, a] = lex.verseRef(ex.verse);
  const cls = (i) => (res ? (i === ex.answer ? 'right' : i === res.picked ? 'wrong' : '') : '');
  const toggle = (i) => setPeek((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return html`<div class="fill">
    <div class="caps center">Read a real verse · ${lex.chapters[s - 1].en} ${s}:${a}</div>
    <div class="card verse-card" style=${{ marginTop: '12px' }}>
      <${VerseWords} vi=${ex.verse} data=${{ w: ex.words }} engine=${engine} opts=${{ hints: settings.hints === 'all' ? 'all' : 'none', tint: settings.tint, translit: false }} peek=${peek} center=${true} compact=${true} onWord=${toggle} />
      <div class="center tiny faint">Tap a word if you need a hint</div>
    </div>
    <div class="caps center" style=${{ marginTop: '16px' }}>${ex.heading}</div>
    <div class="opts">
      ${ex.options.map((o, i) => html`<button class="opt long ${cls(i)}" disabled=${!!res} onClick=${() => onPick(i)}>${o.text}</button>`)}
    </div>
  </div>`;
}

// ------------------------------------------------------------------------------------ feedback

function Feedback({ item, res, pos, onNext }) {
  const { ex, step } = item;
  const ok = res.correct;
  let line = null;
  if (ex.type === 'mcq') {
    line = ex.dir === 'form' ? ex.note : html`<span class="ar-inline" lang="ar">${ex.card.a}</span> = ${ex.card.e}`;
  } else if (ex.type === 'ctx' || ex.type === 'cloze') {
    line = html`<span class="ar-inline" lang="ar">${ex.card.a}</span> = ${ex.card.e}`;
  } else if (ex.type === 'verse') {
    line = ok ? null : html`The meaning: ${ex.translation}`;
  }
  return html`<div class="feedback ${ok ? 'ok' : 'bad'}">
    <div class="big">${ok ? PRAISE[pos % PRAISE.length] : res.picked === -1 ? 'No problem — here it is' : 'Not quite'}${res.out && res.out.graduated ? ' · word learned ✓' : ''}</div>
    ${line ? html`<div class="ans">${line}</div>` : null}
    ${ex.type === 'verse' && ok ? html`<div class="ans small">${ex.translation}</div>` : null}
    <button class="btn ${ok ? 'primary' : 'primary'} block" onClick=${onNext}>Continue</button>
  </div>`;
}

// ------------------------------------------------------------------------------------ summary

function Summary({ sum, onClose, onMore }) {
  const app = useApp();
  const { engine, lex } = app;
  const delta = sum.coverageAfter - sum.coverageBefore;
  const best = sum.streak;
  return html`<div class="sbody" style=${{ paddingTop: '28px' }}>
    <${Confetti} run=${sum.completed && sum.answered > 0} />
    <div class="center stack">
      <div class="big-emoji glow">${sum.accuracy === 1 && sum.answered >= 8 ? '🎯' : sum.streakExtended ? '🔥' : '🌟'}</div>
      <div>
        <div class="h1">${sum.answered ? 'Session complete' : 'All done'}</div>
        <div class="muted">${sum.goal.done ? (sum.streakExtended ? `Day ${best.count} of your streak!` : 'Daily goal complete ✓') : `${Math.floor(sum.goal.minutes)} of ${sum.goal.goal} minutes today`}</div>
      </div>
      <div class="grid3">
        <div class="stat"><b>+${sum.xp}</b><span>XP</span></div>
        <div class="stat"><b>${sum.answered ? Math.round(sum.accuracy * 100) + '%' : '–'}</b><span>accuracy</span></div>
        <div class="stat"><b>${fmtTime(sum.sec)}</b><span>time</span></div>
      </div>
      ${sum.learned.length
        ? html`<div class="card stack-sm" style=${{ textAlign: 'left' }}>
            <div class="caps">${pluralize(sum.learned.length, 'new word')}</div>
            <div class="row wrap" style=${{ gap: '8px' }}>${sum.learned.slice(0, 12).map((id) => html`<button class="chip" onClick=${() => app.openWord(id)}><span class="ar" lang="ar" style=${{ fontSize: '19px', lineHeight: 1.4 }}>${lex.card(id).a}</span><span>${lex.card(id).e.split('/')[0].trim()}</span></button>`)}</div>
          </div>`
        : null}
      ${delta > 0.0004
        ? html`<div class="card stack-sm" style=${{ textAlign: 'left' }}>
            <div class="caps">Reading power</div>
            <div class="row"><div class="bigpct" style=${{ fontSize: '30px' }}>${pct(sum.coverageAfter, 1)}%</div><div class="grow small muted">was ${pct(sum.coverageBefore, 1)}%${sum.newReadable > 0 ? html` · <b style=${{ color: 'var(--primary)' }}>+${pluralize(sum.newReadable, 'verse')}</b> you can now fully understand` : ''}</div></div>
            <${Bar} value=${sum.coverageAfter} gold=${true} />
          </div>`
        : null}
      ${sum.unlocked.map((col) => html`<div class="card stack-sm" style=${{ textAlign: 'left', borderColor: 'var(--gold)' }}>
          <div class="caps" style=${{ color: 'var(--gold)' }}>Passage unlocked</div>
          <div class="h2">${col.t}</div>
          <div class="muted small">You now understand every word. Read it and see.</div>
          <button class="btn primary" onClick=${() => { onClose(); app.openPassage(col.id); }}>Read it now</button>
        </div>`)}
      ${sum.achievements.map((a) => html`<div class="ach"><div class="e">${a.icon}</div><div style=${{ textAlign: 'left' }}><div class="bold">${a.title}</div><div class="small muted">${a.desc}</div></div></div>`)}
    </div>
    <div class="stack-sm" style=${{ marginTop: '22px', paddingBottom: '10px' }}>
      <button class="btn primary big block" onClick=${onClose}>Done</button>
      ${sum.answered ? html`<button class="btn block ghost" onClick=${onMore}>${sum.goal.done ? 'One more round' : 'Keep going'}</button>` : null}
    </div>
  </div>`;
}

// ------------------------------------------------------------------------------------ the session

export function SessionView({ session, onClose }) {
  const app = useApp();
  const { engine, settings } = app;
  const [item, setItem] = useState(null);
  const [res, setRes] = useState(null);
  const [summary, setSummary] = useState(null);
  const [leave, setLeave] = useState(false);
  const [xp, setXp] = useState(null);
  const timer = useRef(null);
  const finished = useRef(false);

  const finish = (completed) => {
    if (finished.current) return;
    finished.current = true;
    const sum = session.finish({ completed });
    if (sum.goal.done) platform.goalDone(dayStr(engine.today()), sum.streak.count);
    app.syncReminder();
    if (completed) {
      setSummary(sum);
      app.fx('big');
    }
  };

  const load = () => {
    let guard = 0;
    while (!session.done && guard++ < 60) {
      const step = session.step;
      const ex = step.t === 'meet' ? { type: 'meet', card: app.lex.card(step.c), example: engine.exampleFor(step.c) } : engine.buildExercise(step);
      if (ex) {
        if (window.__fahmTest) window.__fahmTest.ex = ex; // end-to-end tests read the current exercise
        setItem({ step, ex, key: `${session.pos}:${guard}` });
        setRes(null);
        session.begin();
        return;
      }
      session.skip();
    }
    finish(true);
  };

  const advance = () => {
    clearTimeout(timer.current);
    if (session.done) finish(true);
    else load();
  };

  useEffect(() => {
    load();
    platform.keepScreenOn(true);
    return () => {
      clearTimeout(timer.current);
      platform.keepScreenOn(false);
    };
  }, []);

  useBack(() => {
    if (summary) onClose();
    else setLeave(true);
    return true;
  });

  const record = (result) => {
    const out = session.answer(result, Date.now());
    if (out.xp) setXp({ n: out.xp, k: Date.now() });
    return out;
  };

  const onPick = (i) => {
    if (res || !item) return;
    const { ex } = item;
    const correct = i === ex.answer;
    const out = record({ correct });
    setRes({ correct, picked: i, out });
    app.fx(correct ? 'ok' : 'bad');
    if (correct && ex.type === 'mcq') timer.current = setTimeout(advance, 800);
  };

  const meetDone = (alreadyKnown) => {
    record({ correct: true, alreadyKnown });
    app.fx(alreadyKnown ? 'ok' : 'tap');
    advance();
  };

  const matchDone = (r) => {
    record(r);
    app.fx(r.wrongIds.length ? 'tap' : 'ok');
    advance();
  };

  const leaveNow = () => {
    clearTimeout(timer.current);
    const s = session.stats;
    if (s.correct + s.wrong + s.learned.length > 0) finish(false);
    onClose();
  };

  const body = (() => {
    if (!item) return html`<div class="fill center muted">Getting ready…</div>`;
    const { ex } = item;
    switch (ex.type) {
      case 'meet': return html`<${MeetStep} key=${item.key} ex=${ex} settings=${settings} engine=${engine} onKnown=${() => meetDone(true)} />`;
      case 'mcq': return html`<${ChoiceStep} key=${item.key} ex=${ex} res=${res} onPick=${onPick} settings=${settings} />`;
      case 'ctx':
      case 'cloze': return html`<${ContextStep} key=${item.key} ex=${ex} res=${res} onPick=${onPick} engine=${engine} />`;
      case 'match': return html`<${MatchStep} key=${item.key} ex=${ex} onDone=${matchDone} settings=${settings} />`;
      case 'verse': return html`<${VerseStep} key=${item.key} ex=${ex} res=${res} onPick=${onPick} engine=${engine} settings=${settings} />`;
      default: return null;
    }
  })();

  if (summary) {
    return html`<div class="session"><${Summary} sum=${summary} onClose=${onClose} onMore=${() => app.again(summary)} /></div>`;
  }
  const t = item && item.ex.type;
  const askable = t === 'mcq' || t === 'ctx' || t === 'cloze' || t === 'verse';
  return html`<div class="session">
    <div class="sbar">
      <button class="iconbtn" onClick=${() => setLeave(true)} aria-label="Close"><${Icon} name="close" /></button>
      <${Bar} value=${session.progress} />
      <span class="tiny faint" style=${{ minWidth: '34px', textAlign: 'right' }}>${Math.min(session.pos + 1, session.total)}/${session.total}</span>
    </div>
    <div class="sbody">${body}</div>
    ${xp ? html`<div class="xpfloat" key=${xp.k}>+${xp.n} XP</div>` : null}
    ${res && item
      ? html`<${Feedback} item=${item} res=${res} pos=${session.pos} onNext=${advance} />`
      : t === 'meet'
        ? html`<div class="sfoot"><button class="btn primary big block" onClick=${() => meetDone(false)}>Got it</button></div>`
        : askable
          ? html`<div class="sfoot center"><button class="btn ghost" onClick=${() => onPick(-1)}>I don’t know</button></div>`
          : null}
    ${leave
      ? html`<${Sheet} onClose=${() => setLeave(false)}>
          <div class="h2">Leave this session?</div>
          <div class="muted" style=${{ margin: '6px 0 16px' }}>Your answers so far are saved. You can pick it up again from Today.</div>
          <div class="stack-sm"><button class="btn primary block" onClick=${() => setLeave(false)}>Keep going</button><button class="btn block" onClick=${leaveNow}>Leave</button></div>
        <//>`
      : null}
  </div>`;
}
