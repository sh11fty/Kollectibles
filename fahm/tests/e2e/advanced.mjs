// A learner who has progressed: more step types, unlocked passages, dark mode, settings, speed round.
import { launch } from './harness.mjs';

const OUT = process.argv[2] || '/tmp/fahm-adv';
const h = await launch({ out: OUT, native: true });
const { page } = h;
try {
  await page.goto(h.url);
  await page.waitForSelector('.onb');
  // finish onboarding quickly
  await h.tapText('Get started');
  await h.tapText('Show me how');
  await h.tapText('Serious');
  await h.tapText('Continue');
  await h.tapText('I’m a beginner');
  await h.wait(300);
  if ((await h.text()).includes('gentle reminder')) await h.tapText('Begin my first lesson');
  await page.waitForSelector('.session');
  await h.click('.session .iconbtn[aria-label=Close]');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await h.wait(300);

  // fast-forward: the first 120 path cards known, 14 of them due today
  await page.evaluate(() => {
    const { engine, lex } = window.__fahm;
    const ids = lex.pathOrder.slice(0, 120);
    ids.forEach((id) => engine.markKnown(id));
    ids.forEach((id) => { const c = engine.state.cards[id]; c.t = engine.today() - 3; c.x = engine.today() - 3; });
    ids.slice(20, 60).forEach((id) => { engine.state.cards[id].d = engine.today(); });
    engine.touch();
    engine.store.emit();
  });
  await h.wait(500);
  await h.shot('01-home-progress');

  // today's session with reviews + new words
  await h.click('.hero .btn.primary');
  await page.waitForSelector('.session');
  const r = await h.playSession('s', { wrong: (i) => i % 7 === 3 });
  h.check(r.done, 'advanced session completes');
  console.log('step kinds seen:', [...r.kinds].join(', '));
  await h.wait(500);
  await h.shot('s-summary');
  await h.tapDone();
  await h.wait(300);
  await h.shot('02-home-after');

  // reader with progress
  await h.tab('Read');
  await h.wait(300);
  await h.shot('03-read');
  await h.tapText('All surahs');
  await h.wait(300);
  await h.shot('04-surahs');
  await h.tapText('Al-Fatihah');
  await h.wait(600);
  await h.shot('05-surah-fatiha');
  await page.locator('.vrow').first().click();
  await h.wait(600);
  await h.shot('06-verse-known');
  await h.back(); await h.back();
  await h.wait(300);

  // speed round
  await h.tab('Today');
  await h.wait(300);
  await h.tapText('Speed round');
  await h.wait(300);
  await h.shot('07-speed-ready');
  await h.click('.session .btn.primary');
  for (let i = 0; i < 6; i++) {
    const ex = await page.evaluate(() => window.__fahmTest.ex);
    await page.locator('.session .opts .opt').nth(i === 4 ? (ex.answer + 1) % 4 : ex.answer).click();
    await h.wait(i === 4 ? 800 : 330);
  }
  await h.shot('08-speed-play');
  await h.wait(200);
  await page.evaluate(() => { /* fast-forward the clock by clicking close */ });
  await h.back();
  await h.wait(300);

  // settings & sheets
  await h.tab('Me');
  await h.wait(300);
  await page.evaluate(() => document.getElementById('screen').scrollTo(0, 99999));
  await h.wait(400);
  await h.shot('09-me-bottom');
  await h.tapText('Backup & restore');
  await h.wait(300);
  await h.tapText('Create backup code');
  await h.wait(500);
  await h.shot('10-backup');
  await h.back();
  await h.tab('Path');
  await h.wait(300);
  await page.locator('.lesson').first().click();
  await h.wait(400);
  await h.shot('11-lesson-sheet');
  await h.back();
  await h.tab('Today');
  await page.locator('.pill.flame').click();
  await h.wait(400);
  await h.shot('12-streak-sheet');
  await h.back();

  // dark theme + big text
  await page.evaluate(() => { const { store } = window.__fahm; store.update((s) => { s.settings.theme = 'dark'; s.settings.script = 3; }); });
  await h.wait(400);
  await h.shot('13-home-dark');
  await h.tab('Read');
  await h.wait(200);
  await h.tapText('Al-Fatiha');
  await h.wait(700);
  await h.shot('14-passage-dark-large');
  const calls = await page.evaluate(() => window.__nativeCalls.map((c) => c[0]));
  h.check(calls.includes('setTheme'), 'native setTheme was called');
  h.check(calls.includes('setReminder'), 'native setReminder was called');
  h.check(calls.includes('goalDone'), 'native goalDone was called');
  h.check(calls.includes('keepScreenOn'), 'native keepScreenOn was called');
} catch (e) {
  h.problems.push('exception: ' + e.message);
  console.log(e.stack);
  await h.shot('zz-error').catch(() => {});
}
await h.close();
if (h.problems.length) { console.log('\nPROBLEMS:\n' + h.problems.join('\n')); process.exit(1); }
console.log('\nall good; screenshots in', OUT);
