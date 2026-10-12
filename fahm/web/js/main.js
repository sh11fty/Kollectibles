import { html, render } from './ui/h.js';
import { Lexicon } from './core/lexicon.js';
import { createStore } from './core/store.js';
import { Engine } from './core/engine.js';
import { App } from './ui/app.js';

const root = document.getElementById('app');

const io = {
  async json(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  },
  async bin(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.arrayBuffer();
  },
};

function fail(err) {
  console.error(err);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot';
  box.innerHTML = '<div class="center" style="padding:24px"><div class="big-emoji">😕</div><h2 class="h2">Fahm could not start</h2><p class="muted small"></p><button class="btn primary" style="margin-top:12px">Try again</button></div>';
  box.querySelector('p').textContent = String((err && err.message) || err);
  box.querySelector('button').onclick = () => location.reload();
  root.appendChild(box);
}

async function boot() {
  let storage;
  try {
    storage = window.localStorage;
    storage.getItem('fahm.probe');
  } catch (e) {
    const mem = new Map();
    storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  }
  const lex = await Lexicon.load(io);
  const store = createStore(storage);
  const engine = new Engine(lex, store, io);

  // remember when the learner was last here (used to welcome people back after a break)
  const st = store.get();
  const today = engine.today();
  if (st.lastOpen !== today) {
    st.prevOpen = st.lastOpen;
    st.lastOpen = today;
  }
  window.__fahm = { engine, store, lex };
  render(html`<${App} engine=${engine} lex=${lex} store=${store} />`, root);
}

boot().catch(fail);
window.addEventListener('unhandledrejection', (e) => console.error('unhandled', e.reason));
