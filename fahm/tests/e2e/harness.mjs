// Shared helpers for the end-to-end scripts: a phone-sized Chromium pointed at the local web app.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer } from '../serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

export async function launch({ out = '/tmp/fahm-shots', colorScheme = 'light', width = 412, height = 860, native = false, state = null } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const problems = [];
  const { server, port } = await startServer(0);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme });
  await ctx.addInitScript(([nat, st]) => {
    window.__fahmTest = {};
    if (st && !localStorage.getItem('fahm.state.v1')) localStorage.setItem('fahm.state.v1', JSON.stringify(st));
    if (nat) {
      window.__nativeCalls = [];
      const rec = (name) => (...a) => { window.__nativeCalls.push([name, ...a]); };
      window.Native = {
        versionName: () => '1.0.1', versionCode: () => 101, haptic: rec('haptic'), setTheme: rec('setTheme'), share: rec('share'),
        copy: rec('copy'), openUrl: rec('openUrl'), notificationsGranted: () => true, requestNotifications: rec('requestNotifications'),
        setReminder: rec('setReminder'), goalDone: rec('goalDone'), canInstallUpdates: () => true, openInstallSettings: rec('openInstallSettings'),
        installUpdate: rec('installUpdate'), keepScreenOn: rec('keepScreenOn'), exit: rec('exit'),
      };
    }
  }, [native, state]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

  const h = {
    page, ctx, browser, server, port, problems, out,
    url: `http://127.0.0.1:${port}/`,
    shot: (name) => page.screenshot({ path: `${out}/${name}.png` }),
    text: () => page.evaluate(() => document.body.innerText),
    wait: (ms) => page.waitForTimeout(ms),
    click: (sel, opts) => page.locator(sel).first().click({ timeout: 5000, ...opts }),
    tapText: (t) => page.getByText(t, { exact: false }).first().click({ timeout: 5000 }),
    tab: (label) => page.locator('.tabbar .tab', { hasText: label }).click(),
    back: () => page.evaluate(() => window.__onBack()),
    engine: (fn, arg) => page.evaluate(fn, arg),
    check(cond, msg) {
      if (!cond) { problems.push('check: ' + msg); console.log('FAIL:', msg); } else console.log('ok:  ', msg);
    },
    async close() { await browser.close(); server.close(); },
    tapDone: () => page.locator('.session button', { hasText: /^Done$/ }).click({ timeout: 5000 }),
  };

  /** Play the session on screen to its summary. wrong(i) -> answer step i wrongly. Returns the set of step kinds seen. */
  h.playSession = async function playSession(tag, { wrong = () => false, snap = true, maxSteps = 150 } = {}) {
    const seen = new Set();
    const kinds = new Set();
    for (let i = 0; i < maxSteps; i++) {
      await h.wait(110);
      if (await page.locator('.session .grid3 .stat').count()) return { done: true, kinds };
      const ex = await page.evaluate(() => window.__fahmTest.ex);
      const kind = await page.evaluate(() => {
        if (document.querySelector('.session .meet-card')) return 'meet';
        if (document.querySelector('.session .match')) return 'match';
        if (document.querySelector('.session .opts')) return 'opts';
        return 'other';
      });
      const tagKind = kind + (kind === 'meet' || !ex ? '' : '-' + ex.type + (ex.dir ? '-' + ex.dir : ''));
      kinds.add(tagKind);
      if (snap && !seen.has(tagKind)) { seen.add(tagKind); await h.shot(`${tag}-${tagKind}`); }
      if (kind === 'meet') {
        await h.click('.session .sfoot .btn.primary');
      } else if (kind === 'match') {
        const ids = await page.evaluate(() => [...document.querySelectorAll('.session .match .col:first-child .opt')].map((b) => b.dataset.id));
        for (const [k, id] of ids.entries()) {
          if (k === 0 && wrong(i) && ids.length > 1) {
            await page.locator(`.session .match .col:first-child .opt[data-id="${id}"]`).click();
            await page.locator(`.session .match .col:last-child .opt[data-id="${ids[1]}"]`).click();
            await h.wait(600);
          }
          await page.locator(`.session .match .col:first-child .opt[data-id="${id}"]`).click();
          await page.locator(`.session .match .col:last-child .opt[data-id="${id}"]`).click();
        }
        await h.wait(700);
      } else if (kind === 'opts' && ex) {
        const n = ex.options.length;
        const bad = wrong(i);
        const pick = bad ? (ex.answer + 1) % n : ex.answer;
        await page.locator('.session .opts .opt').nth(pick).click();
        await h.wait(160);
        const fbTag = `${tag}-feedback-${tagKind}-${bad ? 'bad' : 'ok'}`;
        if (snap && !seen.has(fbTag)) { seen.add(fbTag); await h.shot(fbTag); }
        if (await page.locator('.session .feedback .btn').count()) await h.click('.session .feedback .btn');
        else await h.wait(950);
      } else {
        await h.wait(300);
      }
    }
    return { done: false, kinds };
  };
  return h;
}
