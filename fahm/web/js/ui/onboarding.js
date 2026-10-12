// First run: what the app is, how much time to give it, what you already know, reminders.
import { html, useMemo, useState } from './h.js';
import { useApp } from './ctx.js';
import { useBack } from './back.js';
import { Icon } from './icons.js';
import { Switch } from './components.js';
import { GOALS } from '../core/engine.js';
import { platform } from '../platform.js';

const PACE = {
  3: ['Light', 'A quick daily habit — 3 minutes'],
  5: ['Regular', 'The sweet spot for most people — 5 minutes'],
  10: ['Serious', 'Steady progress — 10 minutes'],
  15: ['Intense', 'Fastest — 15 minutes'],
};

export function Onboarding() {
  const app = useApp();
  const { engine, lex, settings } = app;
  const canRemind = platform.isNative || (typeof Notification !== 'undefined');
  const steps = canRemind ? ['hello', 'pace', 'know', 'remind'] : ['hello', 'pace', 'know'];
  const [i, setI] = useState(0);
  const [goal, setGoal] = useState(settings.goalMin || 5);
  const [knownIds, setKnownIds] = useState(() => new Set());
  const [remind, setRemind] = useState(true);
  const [time, setTime] = useState('19:00');
  const step = steps[i];

  const common = useMemo(
    () => lex.cardList.filter((c) => c.k === 'l' && c.e && lex.lessonOfCard.has(c.i)).sort((a, b) => b.o - a.o).slice(0, 12),
    [lex],
  );

  useBack(() => {
    if (i > 0) { setI(i - 1); return true; }
    return false;
  });

  const toggle = (id) => setKnownIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const finish = () => {
    app.store.update((s) => {
      s.onboarded = true;
      s.settings.goalMin = goal;
    });
    knownIds.forEach((id) => engine.markKnown(id));
    if (canRemind && remind) {
      const [h, m] = time.split(':').map(Number);
      app.setReminder({ on: true, h, m });
    }
    app.store.flush();
    app.startPlan(engine.planDaily());
  };

  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());

  return html`<div class="onb">
    <div class="dots" style=${{ padding: '18px 0 6px' }}>${steps.map((_, k) => html`<i class=${k === i ? 'on' : ''}></i>`)}</div>
    <div class="onb-body">
      ${step === 'hello'
        ? html`<div class="center stack">
            <div class="onb-mark ar" lang="ar">فهم</div>
            <div class="h1">Understand the Quran’s words</div>
            <div class="muted" style=${{ fontSize: '17px', lineHeight: 1.5 }}>Not grammar. Not speaking. Just the words and little connecting words you need to read a verse and know what it says.</div>
            <div class="stack-sm" style=${{ textAlign: 'left', marginTop: '10px' }}>
              <div class="onb-point"><b>🧩 Tiny sessions</b><span>3–5 minutes. Short enough to actually do every day.</span></div>
              <div class="onb-point"><b>📖 Real verses from day one</b><span>Every lesson ends with a verse you can now understand.</span></div>
              <div class="onb-point"><b>🌱 It remembers for you</b><span>Words come back just before you’d forget them, and reminders keep you going.</span></div>
            </div>
          </div>`
        : null}
      ${step === 'pace'
        ? html`<div class="stack">
            <div><div class="h1">How much time each day?</div><div class="muted">You can change this any time.</div></div>
            <div class="stack-sm">${Object.keys(GOALS).map((m) => html`<button class="pick ${Number(m) === goal ? 'on' : ''}" onClick=${() => setGoal(Number(m))}>
              <div class="rad"></div><div class="grow"><div class="h3">${PACE[m][0]}</div><div class="muted small">${PACE[m][1]}</div></div>${Number(m) === 5 ? html`<span class="chip soft">Recommended</span>` : null}
            </button>`)}</div>
            <div class="muted small">Missing a day is fine. Fahm never piles up work — if you’re away, your words wait and the next session eases you back in.</div>
          </div>`
        : null}
      ${step === 'know'
        ? html`<div class="stack">
            <div><div class="h1">Know any of these?</div><div class="muted">Tap the words you already know. Not sure? Skip it — we’ll start from the beginning.</div></div>
            <div class="wordgrid">${common.map((c) => html`<button class=${knownIds.has(c.i) ? 'on' : ''} onClick=${() => toggle(c.i)}><span class="ar" lang="ar">${c.a}</span><small>${c.e.split('/')[0].trim()}</small></button>`)}</div>
          </div>`
        : null}
      ${step === 'remind'
        ? html`<div class="stack">
            <div><div class="h1">A gentle reminder?</div><div class="muted">People who study at the same time every day are the ones who keep going.</div></div>
            <div class="list">
              <div class="item"><div class="ico"><${Icon} name="bell" /></div><div class="grow"><div class="lbl">Daily reminder</div><div class="sub">Skipped on days you’ve already finished</div></div><${Switch} on=${remind} onChange=${setRemind} label="Reminder" /></div>
              ${remind ? html`<div class="item"><div class="grow lbl">Time</div><input class="field" style=${{ width: '160px' }} type="time" value=${time} onChange=${(e) => setTime(e.target.value || '19:00')} /></div>` : null}
            </div>
            <div class="muted small">If you ignore reminders for a few days, Fahm backs off instead of nagging.</div>
          </div>`
        : null}
    </div>
    <div class="onb-foot">
      <button class="btn primary big block" onClick=${next}>${step === 'hello' ? 'Get started' : i === steps.length - 1 ? 'Begin my first lesson' : step === 'know' ? (knownIds.size ? `Continue (${knownIds.size} known)` : 'I’m a beginner') : 'Continue'}</button>
      ${i > 0 ? html`<button class="btn ghost block" onClick=${() => setI(i - 1)}>Back</button>` : null}
    </div>
  </div>`;
}
