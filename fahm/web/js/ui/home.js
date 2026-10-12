// "Today": one clear thing to do, plus gentle context about progress.
import { html, useEffect, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon, Flame } from './icons.js';
import { Bar, Ring, VerseWords } from './components.js';
import { greeting } from './hooks.js';
import { GOALS } from '../core/engine.js';
import { pct, pluralize } from '../core/util.js';

function Pct({ value }) {
  return `${pct(value, value < 0.1 ? 1 : 0)}%`;
}

export function Home() {
  const app = useApp();
  const { engine, lex, state, settings } = app;
  const goal = engine.goalProgress();
  const streak = engine.streakInfo();
  const due = engine.dueCards();
  const cov = engine.coverage();
  const np = engine.nextPassage();
  const known = engine.knownCount();
  const early = cov < 0.01;
  const fresh = Object.keys(state.cards).length === 0;
  const [vod, setVod] = useState(null);
  const [showVod, setShowVod] = useState(false);
  const today = engine.today();

  useEffect(() => {
    let on = true;
    const vi = engine.verseOfTheDay();
    if (vi === null || vi === undefined) { setVod(null); return undefined; }
    engine.verses.verse(vi).then((d) => on && setVod({ vi, d }));
    return () => { on = false; };
  }, [today, known >= 12]);

  const start = () => app.startPlan(engine.planDaily());
  const bonus = () => app.startPlan(engine.planDaily({ bonus: true }));
  const quick = () => app.startPlan(engine.planDaily({ quick: true }));
  const away = today - (state.prevOpen ?? state.lastOpen);
  const review = () => app.startPlan(engine.planReview());

  const mins = goal.minutes < 1 ? '0' : String(Math.floor(goal.minutes));
  const newLeft = Math.max(0, (GOALS[settings.goalMin] || GOALS[5]).new - engine.introducedToday());

  return html`<div class="stack">
    <div class="row">
      <div class="grow">
        <div class="caps">${greeting()}</div>
        <div class="h1">Fahm <span class="ar ar-sm" style=${{ color: 'var(--primary)' }} lang="ar">فهم</span></div>
      </div>
      <button class="pill flame ${streak.count ? '' : 'off'}" onClick=${() => app.openStreak()} aria-label="Streak">
        <${Flame} /> ${streak.count}${streak.freezes ? html` <span class="tiny" style=${{ color: 'var(--blue)' }}>❄${streak.freezes}</span>` : null}
      </button>
    </div>

    ${app.update.info
      ? html`<button class="update-banner" style=${{ width: '100%', textAlign: 'left' }} onClick=${() => app.setTab('me')}>
          <${Icon} name="download" /><div class="grow">Update ${app.update.info.version} is ready<div class="small" style=${{ fontWeight: 500 }}>Tap to install — your progress is kept.</div></div><${Icon} name="fwd" size=${18} />
        </button>`
      : null}

    <div class="hero">
      <div class="row" style=${{ alignItems: 'center', gap: '16px' }}>
        <${Ring} value=${goal.fraction} size=${84} stroke=${9}>
          ${goal.done ? html`<${Icon} name="check" size=${34} />` : html`<div><div style=${{ fontSize: '22px' }}>${mins}</div><div class="tiny" style=${{ opacity: 0.8, fontWeight: 600 }}>of ${goal.goal} min</div></div>`}
        <//>
        <div class="grow">
          ${fresh
            ? html`<div class="h2">Your first lesson</div><div class="muted small">3 minutes · a few little words</div>`
            : goal.done
              ? html`<div class="h2">Today’s goal is done 🎉</div><div class="muted small">${streak.count > 1 ? `${streak.count}-day streak. ` : ''}Come back tomorrow — or play a bonus round.</div>`
              : away >= 3 && !fresh
                ? html`<div class="h2">Welcome back 💚</div><div class="muted small">No pressure — a short session gets you going again.</div>`
                : html`<div class="h2">Today’s session</div><div class="muted small">${due.length ? `${pluralize(due.length, 'word')} to review · ` : ''}${newLeft ? `${pluralize(newLeft, 'new word')}` : 'practice'} · about ${Math.max(1, goal.goal - Math.floor(goal.minutes))} min</div>`}
        </div>
      </div>
      <div class="row" style=${{ marginTop: '16px', gap: '10px' }}>
        ${goal.done
          ? html`<button class="btn primary big grow" onClick=${bonus}>Bonus round</button>`
          : html`<button class="btn primary big grow" onClick=${start}>${fresh ? 'Begin' : goal.minutes > 0 ? 'Continue' : 'Start'}</button>`}
      </div>
      ${goal.done || fresh ? null : html`<button class="linkbtn" onClick=${quick}>Short on time? Do a 2-minute version</button>`}
    </div>

    ${due.length >= 50
      ? html`<div class="card soft stack-sm">
          <div class="h3">${due.length} words are waiting 💛</div>
          <div class="muted small">No stress. Spread them over the next week so each day stays short?</div>
          <button class="btn soft small" onClick=${() => { const n = engine.freshStart(); app.toast(`${pluralize(n, 'word')} spread over the week`); }}>Fresh start</button>
        </div>`
      : null}

    <button class="card tap" style=${{ width: '100%', textAlign: 'left' }} onClick=${() => app.setTab('read')}>
      <div class="row" style=${{ alignItems: 'flex-end' }}>
        <div class="bigpct">${early ? known : html`<${Pct} value=${cov} />`}</div>
        <div class="grow"><div class="h3">${early ? (known === 1 ? 'word learned' : 'words learned') : 'of the Quran’s words'}</div><div class="muted small">${early ? 'Real verses unlock very soon' : 'you can understand right now'}</div></div>
      </div>
      <div style=${{ marginTop: '12px' }}><${Bar} value=${cov} /></div>
      <div class="ticks">${[25, 50, 75, 90].map((t) => html`<span style=${{ left: t + '%' }}>${t}%</span>`)}</div>
      <div class="small muted">${early ? 'Reading power: ' + pct(cov, 1) + '% of the Quran’s words · ' : known ? `${pluralize(known, 'word')} known · ` : ''}${pluralize(engine.readableVerseCount(), 'verse')} you can fully understand</div>
    </button>

    ${np
      ? html`<div class="card stack-sm">
          <div class="row"><div class="caps grow">${np.chosen ? 'Your goal' : 'Next goal'}</div><span class="chip gold">${np.st.missing.length} ${np.st.missing.length === 1 ? 'word' : 'words'} to go</span></div>
          <div><div class="h2">${np.col.t}</div><div class="muted small">${np.col.s}</div></div>
          <${Bar} value=${np.st.fraction} gold=${true} />
          <div class="row wrap" style=${{ gap: '6px' }}>
            ${np.st.missing.slice(0, 6).map((id) => html`<button class="chip" onClick=${() => app.openWord(id)}><span class="ar" lang="ar" style=${{ fontSize: '18px', lineHeight: 1.4 }}>${lex.card(id).a}</span></button>`)}
            ${np.st.missing.length > 6 ? html`<span class="chip">+${np.st.missing.length - 6}</span>` : null}
          </div>
          <div class="row" style=${{ gap: '8px' }}>
            <button class="btn primary grow" onClick=${() => app.startPlan(engine.planPassage(np.col.id))}>Learn ${Math.min(10, np.st.missing.length)} of them</button>
            <button class="btn" onClick=${() => app.openPassage(np.col.id)} aria-label="Open passage"><${Icon} name="book" size=${20} /></button>
          </div>
        </div>`
      : null}

    ${vod
      ? html`<div class="card stack-sm">
          <div class="row"><div class="caps grow">A verse you can read</div><button class="chip" onClick=${() => app.openVerse(vod.vi)}>${lex.verseKey(vod.vi)} <${Icon} name="fwd" size=${14} /></button></div>
          <${VerseWords} vi=${vod.vi} data=${vod.d} engine=${engine} opts=${{ hints: 'none', tint: settings.tint, translit: false }} center=${true} onWord=${(i) => app.openToken(vod.vi, i)} />
          ${showVod
            ? html`<div class="translation">${vod.d.t}</div>`
            : html`<button class="btn soft block" onClick=${() => setShowVod(true)}>What does it mean?</button>`}
        </div>`
      : null}

    <div class="grid2">
      <button class="card tap stack-sm" style=${{ textAlign: 'left' }} onClick=${review}>
        <div class="row"><${Icon} name="refresh" /><div class="h3">Review</div></div>
        <div class="muted small">${due.length ? `${pluralize(due.length, 'word')} due` : 'Nothing due — nice!'}</div>
      </button>
      <button class="card tap stack-sm" style=${{ textAlign: 'left' }} onClick=${() => app.openSpeed()}>
        <div class="row"><${Icon} name="bolt" /><div class="h3">Speed round</div></div>
        <div class="muted small">60 seconds${state.stats.bestSpeed ? ` · best ${state.stats.bestSpeed}` : ''}</div>
      </button>
    </div>
  </div>`;
}
