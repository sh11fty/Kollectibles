// The learning path: units of lessons, each unit building towards a passage you can then understand.
import { html, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon } from './icons.js';
import { Bar, ScreenTitle } from './components.js';
import { pluralize } from '../core/util.js';

export function PathScreen() {
  const app = useApp();
  const { engine, lex, state } = app;
  const cur = engine.currentLesson();
  const curUnit = cur ? cur.unit : lex.units.length - 1;
  const [open, setOpen] = useState(() => new Set([curUnit]));
  const toggle = (i) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  let doneLessons = 0;
  const status = new Map();
  for (const l of lex.lessons) {
    const st = engine.lessonStatus(l);
    status.set(l.id, st);
    if (st === 'done') doneLessons++;
  }

  return html`<div class="stack">
    <${ScreenTitle} title="Your path" sub=${`${doneLessons} of ${lex.lessons.length} lessons done`} />
    ${cur
      ? html`<div class="card stack-sm">
          <div class="caps">Up next</div>
          <div class="h2">${cur.title}</div>
          <div class="muted small">${lex.units[cur.unit].t} · ${pluralize(cur.cards.length, 'word')}</div>
          <div class="ars-line" lang="ar">${cur.cards.slice(0, 5).map((id) => html`<span class="ar">${lex.card(id).a}</span>`)}</div>
          <button class="btn primary block" onClick=${() => app.startPlan(engine.planLesson(cur.id))}>Start lesson</button>
        </div>`
      : html`<div class="card center stack-sm"><div class="big-emoji">🏆</div><div class="h2">You finished the whole path!</div><div class="muted">Keep reviewing and read more of the Quran.</div></div>`}

    ${lex.units.map((u, ui) => {
      const lessons = lex.lessons.filter((l) => l.unit === ui);
      const done = lessons.filter((l) => status.get(l.id) === 'done').length;
      const goalCol = u.g ? lex.collectionById.get(u.g) : null;
      const unlocked = goalCol && state.passages[goalCol.id] !== undefined;
      const isOpen = open.has(ui);
      return html`<div class="unit ${done === lessons.length ? 'done' : ''}" key=${u.id}>
        <button class="unit-head" style=${{ width: '100%', textAlign: 'left' }} onClick=${() => toggle(ui)} aria-expanded=${isOpen}>
          <div class="unit-num">${done === lessons.length ? html`<${Icon} name="check" size=${20} />` : ui + 1}</div>
          <div class="grow">
            <div class="h3">${u.t}</div>
            <div class="muted small">${u.s}</div>
            <div class="row" style=${{ marginTop: '6px', gap: '8px' }}>
              <div class="grow"><${Bar} value=${lessons.length ? done / lessons.length : 0} thin=${true} /></div>
              <span class="tiny faint">${done}/${lessons.length}</span>
              ${goalCol ? html`<span class="chip ${unlocked ? 'soft' : ''} tiny">${unlocked ? '✓ ' : ''}${goalCol.t}</span>` : null}
            </div>
          </div>
          <${Icon} name=${isOpen ? 'up' : 'down'} size=${18} />
        </button>
        ${isOpen
          ? lessons.map((l) => {
              const st = status.get(l.id);
              const next = cur && cur.id === l.id;
              return html`<button class="lesson ${st} ${next ? 'next' : ''}" key=${l.id} onClick=${() => app.openLesson(l.id)}>
                <div class="node">${st === 'done' ? html`<${Icon} name="check" size=${20} />` : l.index + 1}</div>
                <div class="grow">
                  <div style=${{ fontWeight: 700 }}>${l.title}</div>
                  <div class="ars" lang="ar">${l.cards.slice(0, 4).map((id) => html`<span>${lex.card(id).a}</span>`)}</div>
                </div>
                <${Icon} name="fwd" size=${18} />
              </button>`;
            })
          : null}
      </div>`;
    })}
  </div>`;
}
