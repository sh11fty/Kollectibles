// End-to-end walk through the real app in headless Chromium at phone size.
//   node tests/e2e/run.mjs [screenshot-dir]
// Fails (exit 1) on any console error, page error or failed assertion; saves screenshots along the way.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer } from '../serve.mjs';

const require = createRequire(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/fahm-shots';
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push(msg); console.log('FAIL:', msg); } else console.log('ok:  ', msg); };

const { server, port } = await startServer(0);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
await ctx.addInitScript(() => { window.__fahmTest = {}; });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const click = (sel, opts) => page.locator(sel).first().click({ timeout: 4000, ...opts });
const tapText = (t) => page.getByText(t, { exact: false }).first().click({ timeout: 4000 });
const tapDone = () => page.locator('.session button', { hasText: /^Done$/ }).click({ timeout: 4000 });
const wait = (ms) => page.waitForTimeout(ms);

/** Play whatever session is on screen to its summary. wrong(i) -> answer step i wrongly. */
async function playSession(tag, { wrong = () => false, snap = true, maxSteps = 120 } = {}) {
  const seen = new Set();
  for (let i = 0; i < maxSteps; i++) {
    await wait(120);
    if (await page.locator('.session .grid3 .stat').count()) return true; // summary
    const ex = await page.evaluate(() => window.__fahmTest.ex);
    const kind = await page.evaluate(() => {
      if (document.querySelector('.session .meet-card')) return 'meet';
      if (document.querySelector('.session .match')) return 'match';
      if (document.querySelector('.session .opts')) return 'opts';
      return 'other';
    });
    if (snap && !seen.has(kind + (ex ? ex.type : ''))) { seen.add(kind + (ex ? ex.type : '')); await shot(`${tag}-${kind}${ex && kind !== 'meet' ? '-' + ex.type : ''}`); }
    if (kind === 'meet') {
      await click('.session .sfoot .btn.primary');
    } else if (kind === 'match') {
      const ids = await page.evaluate(() => [...document.querySelectorAll('.session .match .col:first-child .opt')].map((b) => b.dataset.id));
      for (const [k, id] of ids.entries()) {
        if (k === 0 && wrong(i)) {
          const other = ids[1] || ids[0];
          await page.locator(`.session .match .col:first-child .opt[data-id="${id}"]`).click();
          await page.locator(`.session .match .col:last-child .opt[data-id="${other}"]`).click();
          await wait(600);
        }
        await page.locator(`.session .match .col:first-child .opt[data-id="${id}"]`).click();
        await page.locator(`.session .match .col:last-child .opt[data-id="${id}"]`).click();
      }
      await wait(700);
    } else if (kind === 'opts' && ex) {
      const n = ex.options.length;
      const pick = wrong(i) ? (ex.answer + 1) % n : ex.answer;
      await page.locator('.session .opts .opt').nth(pick).click();
      await wait(150);
      if (snap && !seen.has('fb' + ex.type + (wrong(i) ? 'bad' : 'ok'))) { seen.add('fb' + ex.type + (wrong(i) ? 'bad' : 'ok')); await shot(`${tag}-feedback-${ex.type}-${wrong(i) ? 'bad' : 'ok'}`); }
      if (await page.locator('.session .feedback .btn').count()) await click('.session .feedback .btn');
      else await wait(900); // auto-advance after a correct multiple-choice answer
    } else {
      await wait(300);
    }
  }
  return false;
}

try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('.onb', { timeout: 15000 });
  check((await text()).includes('Understand the Quran'), 'onboarding shows');
  await shot('01-onb-hello');
  await tapText('Get started');
  await page.waitForSelector('.pick');
  await shot('02-onb-pace');
  await tapText('Regular');
  await tapText('Continue');
  await page.waitForSelector('.wordgrid');
  await shot('03-onb-know');
  await tapText('I’m a beginner');
  await wait(300);
  const onbText = await text();
  if (onbText.includes('gentle reminder')) { await shot('04-onb-remind'); await tapText('Begin my first lesson'); }

  // ---- first session
  await page.waitForSelector('.session', { timeout: 10000 });
  check(true, 'first session starts');
  const done1 = await playSession('s1', { wrong: (i) => i === 5 });
  check(done1, 'first session reaches the summary');
  await wait(400);
  await shot('s1-summary');
  const sumText = await text();
  check(/Session complete|All done/.test(sumText), 'summary text present');
  check(/streak|goal/i.test(sumText), 'summary mentions streak or goal');
  await tapDone();
  await wait(300);
  await shot('10-home-after');
  const st1 = await page.evaluate(() => { const e = window.__fahmTest && window.__fahm.engine; return { known: e.knownCount(), cov: e.coverage(), goal: e.goalProgress().done, streak: e.streakInfo().count, cards: Object.keys(e.state.cards).length }; });
  console.log('state after session 1:', JSON.stringify(st1));
  check(st1.cards >= 3, 'cards were introduced');
  check(st1.streak === 1, 'streak is 1 after the first goal');

  // ---- tabs
  for (const [tab, label] of [['path', 'Path'], ['read', 'Read'], ['words', 'Words'], ['me', 'Me']]) {
    await page.locator('.tabbar .tab', { hasText: label }).click();
    await wait(400);
    await shot(`20-tab-${tab}`);
  }

  // ---- reader
  await page.locator('.tabbar .tab', { hasText: 'Read' }).click();
  await wait(300);
  await page.locator('.card.tap', { hasText: 'Al-Fatiha' }).first().click();
  await wait(700);
  await shot('30-passage-fatiha');
  await page.locator('.verse .w').first().click();
  await wait(500);
  await shot('31-token-sheet');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__onBack());
  await wait(300);
  await page.locator('.ref-badge').first().click();
  await wait(700);
  await shot('32-verse-view');
  check((await text()).includes('Show word by word'), 'verse view renders');
  await page.getByText('Show word by word').click();
  await wait(300);
  await shot('33-verse-breakdown');
  await page.evaluate(() => { window.__onBack(); window.__onBack(); });
  await wait(300);

  // ---- speed round (needs known words: learn more first via another session)
  const done2 = await (async () => {
    await page.locator('.tabbar .tab', { hasText: 'Today' }).click();
    await wait(300);
    await page.locator('.hero .btn.primary, .hero .btn').first().click();
    await page.waitForSelector('.session');
    return playSession('s2', { snap: false });
  })();
  check(done2, 'second session reaches the summary');
  await tapDone();
  await wait(300);

  // ---- dark mode + words + word sheet
  await page.locator('.tabbar .tab', { hasText: 'Words' }).click();
  await wait(300);
  await page.locator('.wordrow').first().click();
  await wait(700);
  await shot('40-word-sheet');
  await page.evaluate(() => window.__onBack());
  await ctx.close();
  await browser.close();
} catch (e) {
  problems.push('exception: ' + e.message);
  console.log(e.stack);
  await shot('zz-error').catch(() => {});
  await browser.close().catch(() => {});
}
server.close();
if (problems.length) {
  console.log('\nPROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nall good; screenshots in', OUT);
