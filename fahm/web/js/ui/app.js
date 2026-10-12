// Root of the app: navigation, sheets, sessions, settings sync and the bridge to Android.
import { html, useCallback, useEffect, useRef, useState, useErrorBoundary } from './h.js';
import { AppCtx } from './ctx.js';
import { handleBack, useBack } from './back.js';
import { Icon } from './icons.js';
import { platform } from '../platform.js';
import { fx as playFx } from '../fx.js';
import { stopAudio } from '../audio.js';
import { checkForUpdate } from '../updater.js';
import { defaultState } from '../core/store.js';
import { Home } from './home.js';
import { PathScreen } from './path.js';
import { PassageView, ReadScreen, SurahView, VerseView } from './read.js';
import { WordsScreen } from './words.js';
import { LessonSheet, StreakSheet, TokenSheet, WordSheet } from './sheets.js';
import { MeScreen } from './me.js';
import { SessionView } from './session.js';
import { SpeedRound } from './speed.js';
import { Onboarding } from './onboarding.js';
import { BackBar } from './components.js';

const TABS = [
  { id: 'home', label: 'Today', icon: 'home' },
  { id: 'path', label: 'Path', icon: 'path' },
  { id: 'read', label: 'Read', icon: 'book' },
  { id: 'words', label: 'Words', icon: 'list' },
  { id: 'me', label: 'Me', icon: 'user' },
];
const SCALES = [0.85, 1, 1.15, 1.3, 1.5];
const DAY_MS = 86400000;

export function App({ engine, lex, store }) {
  const [, setRev] = useState(0);
  const [tab, setTab] = useState('home');
  const [views, setViews] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [run, setRun] = useState(null);
  const [speed, setSpeed] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [update, setUpdate] = useState({ info: null, checking: false, error: '', checkedOnce: false, status: '', detail: '' });
  const [error] = useErrorBoundary();
  const toastTimer = useRef(null);
  const permWait = useRef(null);

  const state = store.get();
  const settings = state.settings;

  useEffect(() => store.subscribe(() => setRev((r) => r + 1)), [store]);

  // the learning day may roll over while the app sits in the background
  useEffect(() => {
    const onVis = () => { if (!document.hidden) setRev((r) => r + 1); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ---------------------------------------------------------------- appearance
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const t = settings.theme;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
      else root.removeAttribute('data-theme');
      root.style.setProperty('--ar-scale', String(SCALES[settings.script] ?? 1));
      if (settings.reduceMotion) root.setAttribute('data-motion', 'off');
      else root.removeAttribute('data-motion');
      const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#fbf7ee';
      platform.setTheme(dark, bg);
      const meta = document.querySelector('meta[name=theme-color]');
      if (meta) meta.setAttribute('content', bg);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.script, settings.reduceMotion]);

  // ---------------------------------------------------------------- toast
  const toast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ text, id: Date.now() });
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  // ---------------------------------------------------------------- settings helpers
  const setSetting = useCallback((key, value) => {
    store.update((s) => { s.settings[key] = value; });
    engine.touch();
  }, [store, engine]);

  const syncReminder = useCallback(() => {
    const r = store.get().settings.reminder;
    platform.setReminder({ enabled: r.on, hour: r.h, minute: r.m, nudge: r.nudge, messages: engine.reminderMessages() });
  }, [store, engine]);

  const setReminder = useCallback((patch) => {
    const apply = () => {
      store.update((s) => { Object.assign(s.settings.reminder, patch); });
      syncReminder();
    };
    if (patch.on === true && !platform.notificationsGranted()) {
      permWait.current = apply;
      platform.requestNotifications();
      return;
    }
    apply();
  }, [store, syncReminder]);

  useEffect(() => {
    window.__native.onNotificationPermission = (granted) => {
      const wait = permWait.current;
      permWait.current = null;
      if (granted && wait) wait();
      else if (!granted) toast(platform.isNative ? 'Notifications are off for Fahm — allow them in Android settings to get reminders' : 'Notifications are blocked in this browser');
    };
    window.__native.onUpdateStatus = (status, detail) => setUpdate((u) => ({ ...u, status, detail }));
    window.__onBack = () => handleBack();
    window.__onPause = () => { store.flush(); stopAudio(); };
    const flush = () => store.flush();
    window.addEventListener('pagehide', flush);
    syncReminder();
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // ---------------------------------------------------------------- updates
  const checkUpdate = useCallback(async ({ manual = false } = {}) => {
    setUpdate((u) => ({ ...u, checking: true, error: '' }));
    try {
      const info = await checkForUpdate(platform.versionName(), { repo: platform.updateRepo() });
      store.get().updateCheck = { at: Date.now(), tag: info ? info.tag : '' };
      setUpdate((u) => ({ ...u, info, checking: false, checkedOnce: true, error: '' }));
    } catch (e) {
      setUpdate((u) => ({ ...u, checking: false, error: manual ? 'Could not check right now. Are you online?' : '' }));
    }
  }, [store]);

  useEffect(() => {
    if (!state.onboarded) return;
    const last = state.updateCheck ? state.updateCheck.at : 0;
    if (platform.versionName() !== 'web' && Date.now() - last > 12 * 3600 * 1000) checkUpdate();
  }, [state.onboarded]);

  const installUpdate = useCallback(() => {
    const info = update.info;
    if (!info) return;
    if (!platform.isNative) { platform.openUrl(info.url); return; }
    if (!platform.canInstallUpdates()) { setUpdate((u) => ({ ...u, status: 'needs-permission' })); platform.openInstallSettings(); return; }
    setUpdate((u) => ({ ...u, status: 'downloading', detail: '0' }));
    platform.installUpdate(info.url);
  }, [update.info]);

  // ---------------------------------------------------------------- navigation
  const push = useCallback((v) => { setSheet(null); setViews((vs) => [...vs, v]); }, []);
  const pop = useCallback(() => setViews((vs) => vs.slice(0, -1)), []);
  const replaceTop = useCallback((v) => setViews((vs) => [...vs.slice(0, -1), v]), []);
  const changeTab = useCallback((t) => { setTab(t); setViews([]); stopAudio(); }, []);

  useBack(() => { pop(); return true; }, views.length > 0);
  useBack(() => { changeTab('home'); return true; }, views.length === 0 && tab !== 'home');

  // ---------------------------------------------------------------- sessions
  const startPlan = useCallback(async (plan) => {
    if (!plan || !plan.steps.length) {
      toast('Nothing to practise yet — learn a few words first');
      return;
    }
    setSheet(null);
    stopAudio();
    try { await engine.prepare(plan); } catch (e) { toast('Could not load the verses'); return; }
    setRun({ session: engine.startSession(plan), id: Date.now() });
  }, [engine, toast]);

  const closeRun = useCallback(() => { setRun(null); engine.touch(); store.emit(); }, [engine, store]);

  const again = useCallback((summary) => {
    const bonus = summary.goal.done;
    setRun(null);
    startPlan(engine.planDaily({ bonus }));
  }, [engine, startPlan]);

  const app = {
    engine, lex, store, state, settings, update,
    tab, setTab: changeTab,
    push, pop, replaceTop,
    openSurah: (n) => push({ k: 'surah', n }),
    openPassage: (id) => push({ k: 'passage', id }),
    openVerse: (vi) => push({ k: 'verse', vi }),
    openWord: (id) => setSheet({ k: 'word', id }),
    openToken: (vi, wi) => setSheet({ k: 'token', vi, wi }),
    openLesson: (id) => setSheet({ k: 'lesson', id }),
    openStreak: () => setSheet({ k: 'streak' }),
    openSpeed: () => setSpeed(true),
    startPlan, again,
    toast, setSetting, setReminder, syncReminder,
    checkUpdate, installUpdate,
    fx: (kind) => playFx(kind, store.get().settings),
    replay: () => { store.update((s) => { s.onboarded = false; }); },
    resetAll: () => {
      store.set(defaultState());
      engine.touch();
      store.flush();
      platform.setReminder({ enabled: false, hour: 19, minute: 0, nudge: false, messages: [] });
      setViews([]);
      setTab('home');
      toast('Progress reset');
    },
  };

  if (error) {
    return html`<div class="boot"><div class="center stack" style=${{ padding: '24px' }}>
      <div class="big-emoji">😕</div><div class="h2">Something went wrong</div>
      <div class="muted small sel">${String(error && error.message)}</div>
      <button class="btn primary" onClick=${() => location.reload()}>Reload</button>
      <div class="muted small">Your progress is safe.</div>
    </div></div>`;
  }

  const closeSheet = () => setSheet(null);
  const sheetEl = sheet
    ? sheet.k === 'word' ? html`<${WordSheet} id=${sheet.id} onClose=${closeSheet} />`
      : sheet.k === 'token' ? html`<${TokenSheet} vi=${sheet.vi} wi=${sheet.wi} onClose=${closeSheet} />`
      : sheet.k === 'lesson' ? html`<${LessonSheet} id=${sheet.id} onClose=${closeSheet} />`
      : sheet.k === 'streak' ? html`<${StreakSheet} onClose=${closeSheet} />`
      : null
    : null;

  const renderView = (v) => {
    switch (v.k) {
      case 'surah': return html`<${SurahView} n=${v.n} />`;
      case 'passage': return html`<${PassageView} id=${v.id} />`;
      case 'verse': return html`<${VerseView} vi=${v.vi} />`;
      default: return null;
    }
  };

  const screens = { home: Home, path: PathScreen, read: ReadScreen, words: WordsScreen, me: MeScreen };
  const Screen = screens[tab];
  const goalDone = engine.goalProgress().done;

  return html`<${AppCtx.Provider} value=${app}>
    <div class="app">
      ${!state.onboarded
        ? html`<${Onboarding} />`
        : html`
          <div class="screen" key=${tab} id="screen"><${Screen} /></div>
          <nav class="tabbar" aria-label="Main">
            ${TABS.map((t) => html`<button class="tab ${tab === t.id && !views.length ? 'on' : ''}" key=${t.id} onClick=${() => changeTab(t.id)} aria-label=${t.label}>
              <${Icon} name=${t.icon} />${t.label}${t.id === 'home' && !goalDone ? html`<span class="dot"></span>` : null}
            </button>`)}
          </nav>
          ${views.map((v, i) => html`<div class="view" key=${i} style=${{ display: i === views.length - 1 ? 'flex' : 'none' }}>${renderView(v)}</div>`)}
          ${sheetEl}
          ${run ? html`<${SessionView} key=${run.id} session=${run.session} onClose=${closeRun} />` : null}
          ${speed ? html`<${SpeedRound} onClose=${() => setSpeed(false)} />` : null}`}
      ${toastMsg ? html`<div class="toast" key=${toastMsg.id} role="status">${toastMsg.text}</div>` : null}
    </div>
  <//>`;
}
