// Small setting controls shared by the reader and the settings screen.
import { html } from './h.js';
import { useApp } from './ctx.js';
import { Sheet, Switch } from './components.js';

export function Seg({ value, options, onChange }) {
  return html`<div class="seg">${options.map(([v, label]) => html`<button class=${v === value ? 'on' : ''} onClick=${() => onChange(v)}>${label}</button>`)}</div>`;
}

export function SettingRow({ label, sub, children }) {
  return html`<div class="item" style=${{ cursor: 'default' }}>
    <div class="grow"><div class="lbl">${label}</div>${sub ? html`<div class="sub">${sub}</div>` : null}</div>
    ${children}
  </div>`;
}

/** The settings that change how verses look. */
export function ReadingOptionsBody() {
  const app = useApp();
  const s = app.settings;
  return html`<div class="stack">
    <div class="stack-sm">
      <div class="caps">Word meanings under the Arabic</div>
      <${Seg} value=${s.hints} onChange=${(v) => app.setSetting('hints', v)} options=${[['all', 'All words'], ['unknown', 'New words'], ['none', 'Hidden']]} />
      <div class="muted small">${s.hints === 'unknown' ? 'Words you already know stay clean, so you can test yourself.' : s.hints === 'all' ? 'Every word shows its meaning.' : 'Tap any word to see its meaning.'}</div>
    </div>
    <div class="stack-sm">
      <div class="caps">Text size</div>
      <${Seg} value=${s.script} onChange=${(v) => app.setSetting('script', v)} options=${[[0, 'Small'], [1, 'Normal'], [2, 'Large'], [3, 'XL'], [4, 'XXL']]} />
    </div>
    <div class="list">
      <${SettingRow} label="Show pronunciation" sub="Letters like “bismi” under each word"><${Switch} on=${s.translit} onChange=${(v) => app.setSetting('translit', v)} label="Pronunciation" /><//>
      <${SettingRow} label="Colour connecting words" sub="Words like “in”, “and”, “he” in blue"><${Switch} on=${s.tint} onChange=${(v) => app.setSetting('tint', v)} label="Colour" /><//>
      <${SettingRow} label="Always show translation"><${Switch} on=${s.showTranslation === 'always'} onChange=${(v) => app.setSetting('showTranslation', v ? 'always' : 'tap')} label="Translation" /><//>
    </div>
    <div class="legend">
      <span><i style=${{ background: 'var(--rose)' }}></i>new word</span>
      <span><i style=${{ background: 'var(--gold)' }}></i>learning</span>
      <span style=${{ color: 'var(--blue)' }}>blue = connecting word</span>
    </div>
  </div>`;
}

export function ReadingOptions({ onClose }) {
  return html`<${Sheet} onClose=${onClose}><div class="h2" style=${{ marginBottom: '12px' }}>Reading</div><${ReadingOptionsBody} /><//>`;
}
