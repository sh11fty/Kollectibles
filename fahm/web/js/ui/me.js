// Progress, achievements and settings.
import { html, useState } from './h.js';
import { useApp } from './ctx.js';
import { Icon } from './icons.js';
import { Bar, Ring, ScreenTitle, Sheet, Switch } from './components.js';
import { ReadingOptionsBody, Seg, SettingRow } from './options.js';
import { ACHIEVEMENTS } from '../core/achievements.js';
import { GOALS } from '../core/engine.js';
import { exportCode, importCode } from '../core/store.js';
import { RECITERS } from '../audio.js';
import { pct, pluralize } from '../core/util.js';
import { platform } from '../platform.js';

function Heatmap({ engine }) {
  const today = engine.today();
  const weeks = 17;
  const wd = (today + 4) % 7; // 0 = Sunday
  const start = today - (weeks - 1) * 7 - wd;
  const cells = [];
  for (let d = start; d < start + weeks * 7; d++) {
    if (d > today) { cells.push(html`<i style=${{ opacity: 0 }}></i>`); continue; }
    const r = engine.state.daily[d];
    const min = r ? r.sec / 60 : 0;
    const goal = engine.goalMinutes();
    const lvl = !r || (r.sec < 20 && !r.sessions) ? 0 : r.sessions >= 1 || min >= goal ? 3 : min >= goal / 2 ? 2 : 1;
    cells.push(html`<i class="${lvl ? 'l' + lvl : ''} ${d === today ? 'today' : ''}" title=${`${min.toFixed(1)} min`}></i>`);
  }
  return html`<div class="heat">${cells}</div>`;
}

function BackupSheet({ onClose }) {
  const app = useApp();
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const make = async () => {
    app.store.flush();
    setCode(await exportCode(app.store.get()));
  };
  const restore = async () => {
    try {
      const next = await importCode(text);
      app.store.set(next);
      app.engine.touch();
      app.store.flush();
      app.toast('Progress restored');
      onClose();
    } catch (e) {
      setMsg(e.message || 'Could not read that code.');
    }
  };
  return html`<${Sheet} onClose=${onClose}>
    <div class="h2">Backup & restore</div>
    <div class="muted small" style=${{ margin: '4px 0 14px' }}>Your progress lives on this phone. Save a backup code somewhere safe (notes, email to yourself) to move to a new phone or restore after a reset.</div>
    <div class="stack-sm">
      <button class="btn block soft" onClick=${make}>Create backup code</button>
      ${code
        ? html`<textarea class="field" readonly value=${code} onFocus=${(e) => e.target.select()}></textarea>
            <div class="row" style=${{ gap: '8px' }}>
              <button class="btn grow" onClick=${async () => app.toast((await platform.copy(code)) ? 'Copied' : 'Select the code and copy it')}>Copy</button>
              <button class="btn grow" onClick=${() => platform.share('Fahm backup', code)}>Share</button>
            </div>`
        : null}
    </div>
    <div class="stack-sm" style=${{ marginTop: '22px' }}>
      <div class="caps">Restore from a code</div>
      <textarea class="field" placeholder="Paste your backup code here" value=${text} onInput=${(e) => { setText(e.target.value); setMsg(''); }}></textarea>
      ${msg ? html`<div class="small" style=${{ color: 'var(--rose)' }}>${msg}</div>` : null}
      <button class="btn block" disabled=${!text.trim()} onClick=${restore}>Restore (replaces current progress)</button>
    </div>
  <//>`;
}

function AboutSheet({ onClose }) {
  const app = useApp();
  return html`<${Sheet} onClose=${onClose}>
    <div class="h2">About Fahm</div>
    <div class="muted small" style=${{ margin: '4px 0 14px' }}>Version ${platform.versionName()}. Fahm (فهم) means “understanding”. It teaches the words of the Quran — not grammar — so you can follow what you read.</div>
    <div class="stack-sm small">
      <div><b>Quran text & word meanings</b><br /><span class="muted">Quran.com (word-by-word data, Uthmani script).</span></div>
      <div><b>Translation</b><br /><span class="muted">The Quran — Saheeh International. A translation is only an aid; the Arabic is the Quran.</span></div>
      <div><b>Word analysis</b><br /><span class="muted">Quranic Arabic Corpus v0.4 (corpus.quran.com), © Kais Dukes, GNU GPL. Used to group word forms into lemmas and split prefixes and pronouns.</span></div>
      <div><b>Font</b><br /><span class="muted">Amiri Quran by Khaled Hosny (SIL Open Font License).</span></div>
      <div><b>Recitation</b><br /><span class="muted">Streamed from everyayah.com and Quran.com when you tap listen (needs internet; everything else works offline).</span></div>
      <div><b>Built with</b><br /><span class="muted">Preact and htm. No ads, no tracking, no account. Your progress never leaves your phone.</span></div>
    </div>
    <button class="btn block ghost" style=${{ marginTop: '14px' }} onClick=${() => { onClose(); app.replay(); }}>Show the welcome again</button>
  <//>`;
}

function ResetSheet({ onClose }) {
  const app = useApp();
  return html`<${Sheet} onClose=${onClose}>
    <div class="h2">Reset all progress?</div>
    <div class="muted" style=${{ margin: '6px 0 16px' }}>This deletes your words, streak and badges on this phone. Create a backup code first if you might want them back.</div>
    <div class="stack-sm">
      <button class="btn block danger" onClick=${() => { app.resetAll(); onClose(); }}>Yes, delete everything</button>
      <button class="btn block" onClick=${onClose}>Keep my progress</button>
    </div>
  <//>`;
}

function UpdateBlock() {
  const app = useApp();
  const u = app.update;
  const native = platform.isNative;
  const label = u.status === 'downloading' ? `Downloading… ${u.detail}%` : u.status === 'installing' ? 'Installing…' : `Install ${u.info ? u.info.version : ''}`;
  return html`<div class="stack-sm">
    ${u.info
      ? html`<div class="update-banner" style=${{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div class="row"><${Icon} name="download" /><div class="grow">Version ${u.info.version} is available<div class="small" style=${{ fontWeight: 500 }}>${u.info.size ? `${(u.info.size / 1048576).toFixed(1)} MB · ` : ''}your progress is kept</div></div></div>
          ${u.info.notes ? html`<div class="small" style=${{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>${u.info.notes.slice(0, 300)}</div>` : null}
          ${u.status === 'needs-permission'
            ? html`<div class="small">Allow Fahm to install updates, then come back and tap again.</div><button class="btn small" onClick=${() => platform.openInstallSettings()}>Open permission settings</button>`
            : null}
          <button class="btn primary" disabled=${u.status === 'downloading' || u.status === 'installing'} onClick=${() => app.installUpdate()}>${native ? label : 'Download the new APK'}</button>
          ${u.status === 'error' ? html`<div class="small" style=${{ color: 'var(--rose)' }}>Update failed: ${u.detail}</div>` : null}
        </div>`
      : html`<div class="muted small">${u.checking ? 'Checking…' : u.error ? u.error : u.checkedOnce ? 'You have the latest version.' : 'Updates come from this app’s releases page.'}</div>`}
    <button class="btn small" disabled=${u.checking} onClick=${() => app.checkUpdate({ manual: true })}>Check for updates</button>
  </div>`;
}

export function MeScreen() {
  const app = useApp();
  const { engine, state, settings, lex } = app;
  const cov = engine.coverage();
  const streak = engine.streakInfo();
  const [sheet, setSheet] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const earned = ACHIEVEMENTS.filter((a) => state.achievements[a.id] !== undefined);
  const ordered = [...earned, ...ACHIEVEMENTS.filter((a) => state.achievements[a.id] === undefined)];
  const badges = showAll ? ordered : ordered.slice(0, 8);
  const rem = settings.reminder;
  const hhmm = `${String(rem.h).padStart(2, '0')}:${String(rem.m).padStart(2, '0')}`;
  const acc = state.stats.answered ? Math.round((state.stats.correct / state.stats.answered) * 100) : 0;
  const focus = settings.focus && lex.collectionById.get(settings.focus);
  const week = (() => { let s = 0; for (let d = engine.today() - 6; d <= engine.today(); d++) s += (state.daily[d]?.sec || 0) / 60; return Math.round(s); })();

  return html`<div class="stack">
    <${ScreenTitle} title="Me" sub=${`Day ${engine.today() - state.created + 1} with Fahm`} />

    <div class="card stack">
      <div class="row" style=${{ gap: '16px' }}>
        <${Ring} value=${cov} size=${92} stroke=${10} gold=${true}><div><div style=${{ fontSize: '22px' }}>${pct(cov, cov < 0.1 ? 1 : 0)}%</div></div><//>
        <div class="grow">
          <div class="h3">Reading power</div>
          <div class="muted small">${pluralize(engine.knownCount(), 'word')} known<br />${pluralize(engine.readableVerseCount(), 'verse')} fully understood<br />${pluralize(Object.keys(state.passages).length, 'passage')} unlocked</div>
        </div>
      </div>
      <div class="grid3">
        <div class="stat"><b>${streak.count}</b><span>day streak</span></div>
        <div class="stat"><b>${week}</b><span>min this week</span></div>
        <div class="stat"><b>${acc ? acc + '%' : '–'}</b><span>accuracy</span></div>
      </div>
      <div><div class="caps" style=${{ marginBottom: '8px' }}>Last 17 weeks</div><${Heatmap} engine=${engine} /></div>
    </div>

    <div class="card stack-sm">
      <div class="row"><div class="h3 grow">Badges</div><span class="chip">${earned.length}/${ACHIEVEMENTS.length}</span></div>
      <div class="badges">
        ${badges.map((a) => {
          const got = state.achievements[a.id] !== undefined;
          return html`<button class="badge ${got ? '' : 'locked'}" onClick=${() => app.toast(`${a.title}: ${a.desc}`)}><div class="e">${a.icon}</div>${a.title}</button>`;
        })}
      </div>
      <button class="btn small ghost block" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Show fewer' : 'Show all badges'}</button>
    </div>

    <div class="caps" style=${{ padding: '4px 4px 0' }}>Daily goal</div>
    <div class="card stack-sm">
      <${Seg} value=${settings.goalMin} onChange=${(v) => app.setSetting('goalMin', v)} options=${Object.entries(GOALS).map(([m, g]) => [Number(m), `${m} min`])} />
      <div class="muted small">${GOALS[settings.goalMin].label}: about ${GOALS[settings.goalMin].new} new words a day, plus reviews. Short and regular beats long and rare.</div>
      ${focus
        ? html`<div class="row"><div class="grow small">Current goal: <b>${focus.t}</b></div><button class="btn small ghost" onClick=${() => app.setSetting('focus', '')}>Clear</button></div>`
        : null}
    </div>

    <div class="caps" style=${{ padding: '4px 4px 0' }}>Reminders</div>
    <div class="list">
      <${SettingRow} label="Daily reminder" sub=${rem.on ? `Every day at ${hhmm} — skipped once you’ve finished` : 'Get a gentle nudge so you don’t fall behind'}>
        <${Switch} on=${rem.on} onChange=${(v) => app.setReminder({ on: v })} label="Daily reminder" />
      <//>
      ${rem.on
        ? html`<${SettingRow} label="Time"><input class="field" style=${{ width: '160px' }} type="time" value=${hhmm} onChange=${(e) => { const [h, m] = (e.target.value || '19:00').split(':').map(Number); app.setReminder({ h, m }); }} /><//>
               <${SettingRow} label="Evening streak nudge" sub="One more reminder if you have a streak to protect"><${Switch} on=${rem.nudge} onChange=${(v) => app.setReminder({ nudge: v })} label="Nudge" /><//>`
        : null}
    </div>

    <div class="caps" style=${{ padding: '4px 4px 0' }}>Reading</div>
    <div class="card"><${ReadingOptionsBody} /></div>

    <div class="caps" style=${{ padding: '4px 4px 0' }}>Appearance & feedback</div>
    <div class="card stack-sm">
      <${Seg} value=${settings.theme} onChange=${(v) => app.setSetting('theme', v)} options=${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} />
    </div>
    <div class="list">
      <${SettingRow} label="Vibration"><${Switch} on=${settings.haptics} onChange=${(v) => app.setSetting('haptics', v)} label="Vibration" /><//>
      <${SettingRow} label="Sounds"><${Switch} on=${settings.sound} onChange=${(v) => app.setSetting('sound', v)} label="Sounds" /><//>
      <${SettingRow} label="Reduce motion"><${Switch} on=${settings.reduceMotion} onChange=${(v) => app.setSetting('reduceMotion', v)} label="Reduce motion" /><//>
      <${SettingRow} label="Recitation audio" sub="Listen buttons (needs internet)"><${Switch} on=${settings.audio} onChange=${(v) => app.setSetting('audio', v)} label="Audio" /><//>
      ${settings.audio
        ? html`<${SettingRow} label="Reciter"><select class="field" style=${{ width: '190px' }} value=${settings.reciter} onChange=${(e) => app.setSetting('reciter', e.target.value)}>${RECITERS.map((r) => html`<option value=${r.id}>${r.name}</option>`)}</select><//>`
        : null}
    </div>

    <div class="caps" style=${{ padding: '4px 4px 0' }}>App</div>
    <div class="card stack-sm"><div class="row"><div class="grow"><div class="lbl" style=${{ fontWeight: 650 }}>Updates</div><div class="muted small">Version ${platform.versionName()}</div></div></div><${UpdateBlock} /></div>
    <div class="list">
      <button class="item" onClick=${() => setSheet('backup')}><div class="ico"><${Icon} name="share" /></div><div class="grow"><div class="lbl">Backup & restore</div><div class="sub">Move your progress to another phone</div></div><${Icon} name="fwd" class="chev" size=${18} /></button>
      <button class="item" onClick=${() => setSheet('about')}><div class="ico"><${Icon} name="info" /></div><div class="grow"><div class="lbl">About & sources</div></div><${Icon} name="fwd" class="chev" size=${18} /></button>
      <button class="item" onClick=${() => setSheet('reset')}><div class="ico" style=${{ background: 'var(--rose-soft)', color: 'var(--rose)' }}><${Icon} name="trash" /></div><div class="grow"><div class="lbl">Reset all progress</div></div></button>
    </div>
    ${sheet === 'backup' ? html`<${BackupSheet} onClose=${() => setSheet(null)} />` : null}
    ${sheet === 'about' ? html`<${AboutSheet} onClose=${() => setSheet(null)} />` : null}
    ${sheet === 'reset' ? html`<${ResetSheet} onClose=${() => setSheet(null)} />` : null}
  </div>`;
}
