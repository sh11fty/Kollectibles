import test from 'node:test';
import assert from 'node:assert/strict';
import { checkForUpdate, compareVersions, parseVersion } from '../web/js/updater.js';

const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, body: 'notes', assets: [{ name: 'fahm.apk', browser_download_url: `https://github.com/o/r/releases/download/${tag}/fahm.apk`, size: 5e6 }], ...extra });
const fake = (list, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => list });

test('versions parse and compare piece by piece', () => {
  assert.deepEqual(parseVersion('26.10.12.1530'), [26, 10, 12, 1530]);
  assert.equal(parseVersion('web'), null);
  assert.ok(compareVersions([26, 10, 12, 1530], [26, 10, 12, 959]) > 0);
  assert.ok(compareVersions([26, 11, 1, 1], [26, 10, 31, 2359]) > 0);
  assert.equal(compareVersions([1, 0], [1, 0, 0]), 0);
});

test('finds the newest fahm release and ignores other apps, drafts and prereleases', async () => {
  const list = [
    rel('guardian-latest', { prerelease: true }),
    rel('fahm-v26.10.14.0900', { draft: true }),
    rel('fahm-v26.10.13.2000', { prerelease: true }),
    rel('fahm-v26.10.12.1530'),
    rel('fahm-v26.10.11.0800'),
    rel('fahm-v26.10.15.1000', { assets: [] }),
  ];
  const up = await checkForUpdate('26.10.11.0800', { repo: 'o/r', fetchImpl: fake(list) });
  assert.equal(up.version, '26.10.12.1530');
  assert.equal(up.tag, 'fahm-v26.10.12.1530');
  assert.match(up.url, /fahm-v26\.10\.12\.1530\/fahm\.apk$/);
});

test('no update when current or newer, or when running outside the app', async () => {
  const list = [rel('fahm-v26.10.12.1530')];
  assert.equal(await checkForUpdate('26.10.12.1530', { fetchImpl: fake(list) }), null);
  assert.equal(await checkForUpdate('27.1.1.1', { fetchImpl: fake(list) }), null);
  assert.equal(await checkForUpdate('web', { fetchImpl: fake(list) }), null);
});

test('a failing GitHub request is an error the UI can report', async () => {
  await assert.rejects(() => checkForUpdate('26.1.1.1', { fetchImpl: fake([], false) }), /GitHub returned 500/);
});
