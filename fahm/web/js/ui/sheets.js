// Bottom sheets: a single word, a word inside a verse, a lesson.
import { html, useEffect, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon } from './icons.js';
import { CatTag, Gloss, LevelDots, Rich, Sheet, StateDot, VerseWords } from './components.js';
import { useVerse } from './hooks.js';
import * as srs from '../core/srs.js';
import { dayStr, pluralize } from '../core/util.js';
import { playAudio, stopAudio, onAudio, playingKey, verseUrl, wordUrl } from '../audio.js';

export function cardState(engine, id) {
  if (engine.mask()[id]) return 'known';
  const c = engine.card(id);
  return c && c.s === srs.STAGE_LEARNING ? 'learning' : 'new';
}

function dueText(engine, c) {
  if (!c || c.s !== srs.STAGE_REVIEW) return c && c.s === srs.STAGE_LEARNING ? 'Being learned' : 'Not started';
  const diff = c.d - engine.today();
  if (diff <= 0) return 'Due for review';
  if (diff === 1) return 'Review tomorrow';
  return `Next review in ${diff} days`;
}

/** Hook: true while the given audio key is playing. */
export function usePlaying(key) {
  const [on, setOn] = useState(playingKey() === key);
  useEffect(() => onAudio((cur) => setOn(cur === key)), [key]);
  return on;
}

export function AudioButton({ url, k, label = 'Listen', disabled }) {
  const app = useApp();
  const on = usePlaying(k);
  const click = async () => {
    const ok = await playAudio(url, k);
    if (!ok) app.toast('Audio needs an internet connection');
  };
  return html`<button class="btn small ${on ? 'soft' : ''}" disabled=${disabled} onClick=${click}><${Icon} name=${on ? 'pause' : 'volume'} size=${18} /> ${on ? 'Stop' : label}</button>`;
}

/** Everything about one word card (kept short: meaning first, then context). */
export function WordSheet({ id, onClose }) {
  const app = useApp();
  const { engine, lex, settings } = app;
  const card = lex.card(id);
  const cs = engine.card(id);
  const [examples, setExamples] = useState([]);

  useEffect(() => {
    let on = true;
    const vis = lex.versesWith(id).filter((vi) => lex.wordsIn(vi) >= 3 && lex.wordsIn(vi) <= 12).slice(0, 3);
    Promise.all(vis.map((vi) => engine.verses.verse(vi).then((d) => ({ vi, d })))).then((r) => on && setExamples(r));
    return () => { on = false; };
  }, [id]);

  if (!card) return null;
  const level = srs.level(cs);
  const known = srs.isKnown(cs);

  const teach = () => {
    onClose();
    app.startPlan(engine.planLearn([id], { title: card.e, capstone: true }));
  };
  const markKnown = () => {
    engine.markKnown(id);
    app.fx('ok');
    app.toast('Marked as known — it will come back for review in a week');
  };
  const reset = () => {
    engine.forget(id);
    app.toast('Reset');
  };

  return html`<${Sheet} onClose=${onClose}>
    <div class="center stack-sm">
      <div class="row" style=${{ justifyContent: 'center' }}><${CatTag} c=${card.c} /> <${StateDot} state=${cardState(engine, id)} /></div>
      <div class="ar ar-xl">${card.a}</div>
      <div class="muted">${card.t}</div>
      <div class="meaning">${card.e}</div>
      <div class="row" style=${{ justifyContent: 'center' }}><${LevelDots} level=${level} /><span class="muted small">${dueText(engine, cs)}</span></div>
      <div class="faint small">Appears ${card.o.toLocaleString()} times in the Quran${card.r ? html` · root <span class="ar-inline" lang="ar">${card.r.split('').join(' ')}</span>` : ''}</div>
    </div>
    ${card.x ? html`<div class="note" style=${{ marginTop: '14px' }}><${Rich} text=${card.x} /></div>` : null}
    ${card.f && card.f.length
      ? html`<div class="forms" style=${{ marginTop: '14px' }}>${card.f.slice(0, 6).map((f) => html`<div class="form-chip"><span class="ar" lang="ar">${f[0]}</span><span>${f[1]}</span></div>`)}</div>`
      : null}
    ${examples.length
      ? html`<div class="stack-sm" style=${{ marginTop: '16px' }}>
          <div class="caps">In the Quran</div>
          ${examples.map(({ vi, d }) => {
            const t0 = lex.offsets[vi];
            let target = -1;
            for (let t = t0; t < lex.offsets[vi + 1]; t++) if (lex.prim[t] === id || lex.reqOf(t).includes(id)) { target = t - t0; break; }
            return html`<button class="example tap-block" onClick=${() => { onClose(); app.openVerse(vi); }}>
              <${VerseWords} vi=${vi} data=${d} engine=${engine} opts=${{ hints: 'all', tint: true, translit: false }} target=${target} center=${true} onWord=${() => { onClose(); app.openVerse(vi); }} />
              <div class="small muted" style=${{ marginTop: '6px' }}>${d.t}</div>
              <div class="tiny faint">${lex.verseKey(vi)}</div>
            </button>`;
          })}
        </div>`
      : null}
    <div class="stack-sm" style=${{ marginTop: '18px' }}>
      ${known
        ? html`<button class="btn block soft" onClick=${teach}>Practise this word</button>`
        : html`<button class="btn block primary" onClick=${teach}>Teach me this word</button>
               <button class="btn block ghost" onClick=${markKnown}>I already know it</button>`}
      ${cs ? html`<button class="btn block ghost small" onClick=${reset}>Reset this word</button>` : null}
    </div>
  <//>`;
}

/** A word inside a verse: what it means, what it is made of, and what is still unknown. */
export function TokenSheet({ vi, wi, onClose }) {
  const app = useApp();
  const { engine, lex } = app;
  const d = useVerse(engine, vi);
  const w = d && d.w[wi];
  const [s, a] = lex.verseRef(vi);
  const ti = lex.offsets[vi] + wi;
  const parts = (w && w[4]) || [];
  const order = (id) => { const k = parts.findIndex((x) => x[1] === id); return k < 0 ? 99 : k; };
  const ids = lex.reqOf(ti).slice().sort((x, y) => order(x) - order(y));
  const textFor = (id) => {
    const p = parts.find((x) => x[1] === id);
    return p ? p[0] : lex.card(id).a;
  };
  const missing = ids.filter((id) => !engine.mask()[id]);

  const learn = () => {
    onClose();
    app.startPlan(engine.planLearn(missing, { title: 'This word', capstone: true, verses: [vi] }));
  };

  if (!w) return html`<${Sheet} onClose=${onClose}><div class="center muted" style=${{ padding: '30px' }}>Loading…</div><//>`;
  return html`<${Sheet} onClose=${onClose}>
    <div class="center stack-sm">
      <div class="ar ar-lg">${w[0]}</div>
      <div class="muted">${w[2]}</div>
      <div class="meaning"><${Gloss} g=${w[1]} /></div>
      <${AudioButton} url=${wordUrl(s, a, wi + 1)} k=${'w' + vi + ':' + wi} label="Hear this word" />
    </div>
    <div class="stack-sm" style=${{ marginTop: '16px' }}>
      <div class="caps">${ids.length > 1 ? 'Made of' : 'Word'}</div>
      <div class="list">
        ${ids.map((id) => {
          const c = lex.card(id);
          return html`<button class="wordrow" onClick=${() => app.openWord(id)}>
            <div class="ar ar-md ${c.c === 'c' || c.c === 'r' || c.c === 'b' ? 'cat-c' : ''}" lang="ar">${textFor(id)}</div>
            <div class="grow"><div class="lbl" style=${{ fontWeight: 650 }}>${c.e}</div><div class="row"><${CatTag} c=${c.c} /><${LevelDots} level=${srs.level(engine.card(id))} /></div></div>
            <${StateDot} state=${cardState(engine, id)} />
          </button>`;
        })}
      </div>
    </div>
    <div class="stack-sm" style=${{ marginTop: '16px' }}>
      ${missing.length
        ? html`<button class="btn block primary" onClick=${learn}>Learn ${missing.length === 1 ? 'this piece' : pluralize(missing.length, 'new piece')}</button>`
        : html`<div class="center muted small">You know every piece of this word ✓</div>`}
    </div>
  <//>`;
}

/** One lesson of the path. */
export function LessonSheet({ id, onClose }) {
  const app = useApp();
  const { engine, lex } = app;
  const lesson = lex.lessonById.get(id);
  const unit = lex.units[lesson.unit];
  const status = engine.lessonStatus(lesson);
  const start = () => {
    onClose();
    app.startPlan(engine.planLesson(id));
  };
  return html`<${Sheet} onClose=${onClose}>
    <div class="stack-sm">
      <div class="caps">${unit.t}</div>
      <div class="h2">${lesson.title}</div>
      <div class="muted small">${pluralize(lesson.cards.length, 'word')} · about ${Math.max(1, Math.round(lesson.cards.length * 0.5))} min</div>
    </div>
    <div class="list" style=${{ marginTop: '14px' }}>
      ${lesson.cards.map((cid) => {
        const c = lex.card(cid);
        return html`<button class="wordrow" onClick=${() => app.openWord(cid)}>
          <div class="ar ar-md" lang="ar">${c.a}</div>
          <div class="grow"><div style=${{ fontWeight: 650 }}>${c.e}</div><${LevelDots} level=${srs.level(engine.card(cid))} /></div>
        </button>`;
      })}
    </div>
    <button class="btn primary big block" style=${{ marginTop: '16px' }} onClick=${start}>${status === 'done' ? 'Practise again' : status === 'started' ? 'Continue lesson' : 'Start lesson'}</button>
  <//>`;
}

/** Streak details. */
export function StreakSheet({ onClose }) {
  const app = useApp();
  const { engine } = app;
  const info = engine.streakInfo();
  const today = engine.today();
  const days = [];
  for (let d = today - 6; d <= today; d++) {
    const g = engine.goalProgress(d);
    days.push({ d, done: g.done, label: dayStr(d).slice(8) });
  }
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return html`<${Sheet} onClose=${onClose}>
    <div class="center stack-sm">
      <div class="big-emoji">🔥</div>
      <div class="h1">${info.count} ${info.count === 1 ? 'day' : 'days'}</div>
      <div class="muted">${info.doneToday ? 'Today is done — see you tomorrow.' : info.count ? 'Finish today’s session to keep it going.' : 'Do one short session to start a streak.'}</div>
    </div>
    <div class="row" style=${{ justifyContent: 'space-between', margin: '18px 4px 6px' }}>
      ${days.map((x) => html`<div class="center"><div class="tiny faint">${names[(x.d + 4) % 7]}</div><div class="dayball ${x.done ? 'on' : ''}">${x.done ? '✓' : ''}</div></div>`)}
    </div>
    <div class="grid3" style=${{ marginTop: '14px' }}>
      <div class="stat"><b>${info.count}</b><span>current</span></div>
      <div class="stat"><b>${info.best}</b><span>best</span></div>
      <div class="stat"><b>${info.freezes}</b><span>❄ freezes</span></div>
    </div>
    <div class="note" style=${{ marginTop: '14px' }}>Miss a day? A freeze keeps your streak alive automatically. You earn one every 7 days in a row (up to 2). A day counts when you finish a session or practise for your daily goal.</div>
  <//>`;
}

export { dueText };
