// Reading: passages and surahs, and the verse view where the learner puts the words to work.
import { html, useEffect, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon } from './icons.js';
import { Bar, BackBar, Gloss, ScreenTitle, StateDot, VerseWords } from './components.js';
import { useSurah, useVerse, readerOpts } from './hooks.js';
import { AudioButton } from './sheets.js';
import { ReadingOptions } from './options.js';
import { missingForVerse } from '../core/lexicon.js';
import { pct, pluralize } from '../core/util.js';
import { verseUrl } from '../audio.js';
import { platform } from '../platform.js';

function Translation({ text, always }) {
  const [show, setShow] = useState(always);
  useEffect(() => setShow(always), [always, text]);
  if (!text) return null;
  return show ? html`<div class="translation sel">${text}</div>` : html`<button class="btn soft block" onClick=${() => setShow(true)}>Show meaning</button>`;
}

// ------------------------------------------------------------------------------- list of passages & surahs

/** "2:255" -> verse index, or null. */
function parseRef(lex, text) {
  const m = /^\s*(\d{1,3})\s*[:.\s]\s*(\d{1,3})\s*$/.exec(text);
  if (!m) return null;
  const s = Number(m[1]);
  const a = Number(m[2]);
  if (s < 1 || s > 114 || a < 1 || a > lex.chapters[s - 1].v) return null;
  return lex.verseIndex(s, a);
}

export function ReadScreen() {
  const app = useApp();
  const { engine, lex, state } = app;
  const [mode, setMode] = useState('passages');
  const [order, setOrder] = useState('quran');
  const [ref, setRef] = useState('');
  const refVi = ref ? parseRef(lex, ref) : null;
  const last = state.lastRead >= 0 ? state.lastRead : null;

  const passages = lex.collections.map((col) => ({ col, st: engine.passageStats(col), done: state.passages[col.id] !== undefined }));
  passages.sort((a, b) => Number(a.done) - Number(b.done) || b.st.fraction - a.st.fraction || lex.collections.indexOf(a.col) - lex.collections.indexOf(b.col));

  let surahs = lex.chapters.map((ch) => ({ ch, st: engine.surahStats(ch.n) }));
  if (order === 'easy') surahs = surahs.slice().sort((a, b) => b.st.fraction - a.st.fraction || a.st.total - b.st.total);

  return html`<div class="stack">
    <${ScreenTitle} title="Read" sub="Tap any word you don’t know yet" />
    ${last !== null
      ? html`<button class="card tap row" style=${{ width: '100%', textAlign: 'left' }} onClick=${() => app.openVerse(last)}>
          <${Icon} name="book" /><div class="grow"><div class="h3">Continue reading</div><div class="muted small">${lex.chapters[lex.verseRef(last)[0] - 1].en} ${lex.verseKey(last)}</div></div><${Icon} name="fwd" size=${18} />
        </button>`
      : null}
    <form class="searchbox" onSubmit=${(e) => { e.preventDefault(); if (refVi !== null) app.openVerse(refVi); }}>
      <${Icon} name="search" size=${20} />
      <input class="field" inputmode="numeric" placeholder="Go to a verse, e.g. 2:255" value=${ref} onInput=${(e) => setRef(e.target.value)} aria-label="Go to a verse" />
      ${refVi !== null ? html`<button type="submit" class="chip on gobtn">Open ${lex.verseKey(refVi)}</button>` : null}
    </form>
    <div class="seg">
      <button class=${mode === 'passages' ? 'on' : ''} onClick=${() => setMode('passages')}>Passages</button>
      <button class=${mode === 'surahs' ? 'on' : ''} onClick=${() => setMode('surahs')}>All surahs</button>
    </div>
    ${mode === 'passages'
      ? html`<div class="stack-sm">
          ${passages.map(({ col, st, done }) => html`<button class="card tap stack-sm" style=${{ width: '100%', textAlign: 'left' }} key=${col.id} onClick=${() => app.openPassage(col.id)}>
            <div class="row">
              <div class="grow"><div class="h3">${col.t}</div><div class="muted small">${col.s}</div></div>
              ${done ? html`<span class="chip soft">✓ Understood</span>` : html`<span class="chip ${st.missing.length <= 3 ? 'gold' : ''}">${st.missing.length} to go</span>`}
            </div>
            <${Bar} value=${st.fraction} gold=${!done} />
            <div class="tiny faint">${pct(st.fraction)}% of its words known · ${pluralize(st.verses, 'verse')}</div>
          </button>`)}
        </div>`
      : html`<div class="stack-sm">
          <div class="chips">
            <button class="chip ${order === 'quran' ? 'on' : ''}" onClick=${() => setOrder('quran')}>Quran order</button>
            <button class="chip ${order === 'easy' ? 'on' : ''}" onClick=${() => setOrder('easy')}>Easiest first</button>
          </div>
          <div class="list">
            ${surahs.map(({ ch, st }) => html`<button class="surah-row" key=${ch.n} onClick=${() => app.openSurah(ch.n)}>
              <div class="surah-num">${ch.n}</div>
              <div class="grow">
                <div class="row"><div style=${{ fontWeight: 700 }}>${ch.en}</div><div class="faint small">${ch.tr}</div></div>
                <div class="row" style=${{ gap: '8px', marginTop: '5px' }}><div class="grow"><${Bar} value=${st.fraction} thin=${true} /></div><span class="tiny faint">${pct(st.fraction)}%</span></div>
              </div>
              <div class="ar ar-sm" lang="ar" style=${{ color: 'var(--ink2)' }}>${ch.ar}</div>
            </button>`)}
          </div>
        </div>`}
  </div>`;
}

// ------------------------------------------------------------------------------- passage

export function PassageView({ id }) {
  const app = useApp();
  const { engine, lex, state, settings } = app;
  const col = lex.collectionById.get(id);
  const vis = col.v.map(([s, a]) => lex.verseIndex(s, a));
  const [ready, setReady] = useState(false);
  const [opts, setOpts] = useState(false);
  useEffect(() => {
    let on = true;
    engine.verses.preload(vis).then(() => on && setReady(true));
    return () => { on = false; };
  }, [id]);
  const st = engine.passageStats(col);
  const done = state.passages[id] !== undefined;
  const isFocus = settings.focus === id;

  return html`<${BackBar} title=${col.t} onBack=${app.pop} right=${html`<button class="iconbtn" onClick=${() => setOpts(true)} aria-label="Reading options"><${Icon} name="sliders" /></button>`} />
    <div class="screen no-tabs"><div class="stack">
      <div class="card stack-sm">
        <div class="muted">${col.s}</div>
        <${Bar} value=${st.fraction} gold=${!done} />
        <div class="small">${done ? '✓ You understand every word of this passage.' : `${st.missing.length} ${st.missing.length === 1 ? 'word' : 'words'} to go · ${st.readableVerses}/${st.verses} verses readable`}</div>
        ${done ? null : html`<div class="row" style=${{ gap: '8px' }}>
          <button class="btn primary grow" onClick=${() => app.startPlan(engine.planPassage(id))}>Learn the missing words</button>
          <button class="btn ${isFocus ? 'soft' : ''}" onClick=${() => { app.setSetting('focus', isFocus ? '' : id); app.toast(isFocus ? 'Goal cleared' : `New words will now come from ${col.t}`); }} aria-label="Make this my goal"><${Icon} name="target" size=${20} /></button>
        </div>`}
        ${isFocus && !done ? html`<div class="tiny faint">This is your current goal — new words come from it first.</div>` : null}
      </div>
      ${ready
        ? vis.map((vi) => {
            const d = engine.verses.peek(vi);
            if (!d) return null;
            return html`<${VerseBlock} key=${vi} vi=${vi} d=${d} />`;
          })
        : html`<div class="center muted" style=${{ padding: '30px' }}>Loading…</div>`}
    </div></div>
    ${opts ? html`<${ReadingOptions} onClose=${() => setOpts(false)} />` : null}`;
}

function VerseBlock({ vi, d }) {
  const app = useApp();
  const { engine, lex, settings } = app;
  const [s, a] = lex.verseRef(vi);
  const { known, total } = engine.verseStats();
  return html`<div class="card verse-card stack-sm">
    <div class="verse-nav">
      <button class="ref-badge" onClick=${() => app.openVerse(vi)}>${s}:${a}</button>
      <span class="tiny faint">${known[vi]}/${total[vi]} words known</span>
    </div>
    <${VerseWords} vi=${vi} data=${d} engine=${engine} opts=${readerOpts(settings)} onWord=${(i) => app.openToken(vi, i)} />
    <${Translation} text=${d.t} always=${settings.showTranslation === 'always'} />
  </div>`;
}

// ------------------------------------------------------------------------------- surah

export function SurahView({ n }) {
  const app = useApp();
  const { engine, lex } = app;
  const ch = lex.chapters[n - 1];
  const data = useSurah(engine, n);
  const st = engine.surahStats(n);
  const stats = engine.verseStats();
  const [limit, setLimit] = useState(30);
  const shown = Math.min(limit, ch.v);

  return html`<${BackBar} title=${ch.en} onBack=${app.pop} />
    <div class="screen no-tabs"><div class="stack">
      <div class="card center stack-sm">
        <div class="ar ar-lg" lang="ar">${ch.ar}</div>
        <div class="muted">${ch.tr} · ${ch.rev === 'madinah' ? 'Medinan' : 'Meccan'} · ${pluralize(ch.v, 'verse')}</div>
        <${Bar} value=${st.fraction} />
        <div class="small muted">${pct(st.fraction)}% of its words known · ${st.readable} of ${ch.v} verses fully readable</div>
      </div>
      ${data
        ? html`<div class="list">
            ${Array.from({ length: shown }, (_, k) => {
              const vi = ch.o + k;
              const v = data.v[k];
              const f = stats.known[vi] / stats.total[vi];
              return html`<button class="vrow" key=${vi} onClick=${() => app.openVerse(vi)} style=${{ padding: '14px 16px' }}>
                <div class="top"><span class="vdot ${f === 1 ? 'full' : f >= 0.75 ? 'most' : ''}"></span><span class="ref-badge">${n}:${k + 1}</span><span class="tiny faint">${stats.known[vi]}/${stats.total[vi]} words</span></div>
                <div class="ar ar-sm clamp2" lang="ar">${v.w.map((x) => x[0]).join(' ')}</div>
                <div class="small muted clamp2">${v.t}</div>
              </button>`;
            })}
          </div>
          ${shown < ch.v ? html`<button class="btn block" onClick=${() => setLimit(limit + 40)}>Show more verses (${ch.v - shown} left)</button>` : null}`
        : html`<div class="center muted" style=${{ padding: '30px' }}>Loading…</div>`}
    </div></div>`;
}

// ------------------------------------------------------------------------------- one verse

export function VerseView({ vi }) {
  const app = useApp();
  const { engine, lex, settings } = app;
  const d = useVerse(engine, vi);
  const [s, a] = lex.verseRef(vi);
  const ch = lex.chapters[s - 1];
  const { known, total } = engine.verseStats();
  const missing = missingForVerse(lex, engine.mask(), vi);
  const [breakdown, setBreakdown] = useState(false);
  const [opts, setOpts] = useState(false);
  const full = known[vi] === total[vi];
  const go = (nvi) => { if (nvi >= 0 && nvi < lex.verseCount) app.replaceTop({ k: 'verse', vi: nvi }); };

  useEffect(() => { setBreakdown(false); app.store.get().lastRead = vi; }, [vi]);

  const share = () => {
    if (!d) return;
    platform.share(`Quran ${s}:${a}`, `${d.w.map((x) => x[0]).join(' ')}\n\n${d.t}\n\n— Quran ${s}:${a} (${ch.en})`);
  };

  return html`<${BackBar} title=${`${ch.en} ${s}:${a}`} onBack=${app.pop} right=${html`<button class="iconbtn" onClick=${() => setOpts(true)} aria-label="Reading options"><${Icon} name="sliders" /></button>`} />
    <div class="screen no-tabs"><div class="stack">
      <div class="card verse-card stack-sm">
        ${d
          ? html`<${VerseWords} vi=${vi} data=${d} engine=${engine} opts=${readerOpts(settings)} center=${true} onWord=${(i) => app.openToken(vi, i)} />`
          : html`<div class="center muted" style=${{ padding: '30px' }}>Loading…</div>`}
        <div class="row" style=${{ justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span class="chip ${full ? 'soft' : ''}">${full ? '✓ You know every word' : `${known[vi]} of ${total[vi]} words known`}</span>
          ${settings.audio ? html`<${AudioButton} url=${verseUrl(settings.reciter, s, a)} k=${'v' + vi} label="Listen" />` : null}
        </div>
      </div>
      ${d ? html`<${Translation} text=${d.t} always=${settings.showTranslation === 'always'} />` : null}

      ${missing.length
        ? html`<div class="card stack-sm">
            <div class="h3">${pluralize(missing.length, 'word')} between you and this verse</div>
            <div class="row wrap" style=${{ gap: '6px' }}>${missing.slice(0, 8).map((id) => html`<button class="chip" onClick=${() => app.openWord(id)}><span class="ar" lang="ar" style=${{ fontSize: '18px', lineHeight: 1.4 }}>${lex.card(id).a}</span> <span>${lex.card(id).e.split('/')[0].trim()}</span></button>`)}</div>
            <button class="btn primary block" onClick=${() => app.startPlan(engine.planVerse(vi))}>Learn ${missing.length > 8 ? 'the first 8' : 'them'} now</button>
          </div>`
        : html`<button class="btn soft block" onClick=${() => app.startPlan(engine.planVerse(vi))}>Test my understanding</button>`}

      ${d
        ? html`<div class="stack-sm">
            <button class="btn block" onClick=${() => setBreakdown(!breakdown)}>${breakdown ? 'Hide' : 'Show'} word by word</button>
            ${breakdown
              ? html`<div class="list">${d.w.map((w, i) => {
                  const ti = lex.offsets[vi] + i;
                  return html`<button class="wordrow" key=${i} onClick=${() => app.openToken(vi, i)}>
                    <div class="ar ar-md" lang="ar">${w[0]}</div>
                    <div class="grow"><div style=${{ fontWeight: 650 }}><${Gloss} g=${w[1]} /></div><div class="tiny faint">${w[2]}</div></div>
                    <${StateDot} state=${engine.wordState(ti)} />
                  </button>`;
                })}</div>`
              : null}
          </div>`
        : null}

      <div class="row" style=${{ gap: '10px' }}>
        <button class="btn grow" disabled=${vi <= 0} onClick=${() => go(vi - 1)}><${Icon} name="back" size=${18} /> Previous</button>
        <button class="btn iconbtn" style=${{ minWidth: '48px' }} onClick=${share} aria-label="Share"><${Icon} name="share" size=${20} /></button>
        <button class="btn grow" disabled=${vi >= lex.verseCount - 1} onClick=${() => go(vi + 1)}>Next <${Icon} name="fwd" size=${18} /></button>
      </div>
    </div></div>
    ${opts ? html`<${ReadingOptions} onClose=${() => setOpts(false)} />` : null}`;
}
