// The word bank: every word card in the app, searchable, with how well it is known.
import { html, useMemo, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon } from './icons.js';
import { CatTag, LevelDots, ScreenTitle } from './components.js';
import { stripMarks } from '../core/util.js';
import * as srs from '../core/srs.js';

const FILTERS = [
  ['all', 'All'],
  ['known', 'Known'],
  ['learning', 'Learning'],
  ['todo', 'Not yet'],
  ['connect', 'Connecting'],
  ['verb', 'Verbs'],
  ['noun', 'Nouns'],
];
const PAGE = 60;

export function WordsScreen() {
  const app = useApp();
  const { engine, lex } = app;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const inPath = useMemo(() => new Set(lex.pathOrder), [lex]);
  const list = useMemo(() => lex.cardList.filter((c) => inPath.has(c.i) && c.e), [lex]);
  const known = engine.knownCount();
  const learning = engine.learningCards().length;

  const query = q.trim().toLowerCase();
  const qa = stripMarks(q.trim());
  const rows = list.filter((c) => {
    const cs = engine.card(c.i);
    if (filter === 'known' && !srs.isKnown(cs)) return false;
    if (filter === 'learning' && !(cs && cs.s === srs.STAGE_LEARNING)) return false;
    if (filter === 'todo' && cs && cs.s !== srs.STAGE_NEW) return false;
    if (filter === 'connect' && !(c.c === 'c' || c.c === 'r' || c.c === 'b')) return false;
    if (filter === 'verb' && c.c !== 'v') return false;
    if (filter === 'noun' && !(c.c === 'n' || c.c === 'a' || c.c === 'p')) return false;
    if (!query) return true;
    return c.e.toLowerCase().includes(query) || (c.t || '').toLowerCase().includes(query) || (qa && stripMarks(c.a).includes(qa)) || (qa && c.r && c.r.includes(qa));
  });
  if (!query) rows.sort((a, b) => b.o - a.o);
  const shown = rows.slice(0, limit);

  return html`<div class="stack">
    <${ScreenTitle} title="Words" sub=${`${known} known · ${learning} learning · ${list.length.toLocaleString()} words in the app`} />
    <div class="searchbox"><${Icon} name="search" size=${20} /><input class="field" type="search" placeholder="Search a word, meaning or root" value=${q} onInput=${(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Search words" /></div>
    <div class="chips">${FILTERS.map(([id, label]) => html`<button class="chip ${filter === id ? 'on' : ''}" onClick=${() => { setFilter(id); setLimit(PAGE); }}>${label}</button>`)}</div>
    ${shown.length
      ? html`<div class="list">
          ${shown.map((c) => html`<button class="wordrow" key=${c.i} onClick=${() => app.openWord(c.i)}>
            <div class="ar ar-md" lang="ar">${c.a}</div>
            <div class="grow">
              <div style=${{ fontWeight: 650 }}>${c.e}</div>
              <div class="row" style=${{ gap: '8px' }}><${CatTag} c=${c.c} /><${LevelDots} level=${srs.level(engine.card(c.i))} /></div>
            </div>
            <div class="tiny faint" style=${{ textAlign: 'right' }}>${c.o.toLocaleString()}×</div>
          </button>`)}
        </div>
        ${rows.length > shown.length ? html`<button class="btn block" onClick=${() => setLimit(limit + PAGE)}>Show more (${rows.length - shown.length})</button>` : null}`
      : html`<div class="card center muted">${filter === 'all' ? 'No words match.' : 'Nothing here yet — keep learning!'}</div>`}
  </div>`;
}
