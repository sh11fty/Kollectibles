// Looks for a newer Fahm build on GitHub. Only releases tagged "fahm-v<major>.<minor>.<build>" count, because
// this repository also hosts other apps.

const API = 'https://api.github.com/repos/sh11fty/Kollectibles/releases?per_page=20';
const TAG = /^fahm-v(\d+)\.(\d+)\.(\d+)$/;

function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -> {version, url, notes, tag} when a newer build exists, else null. */
export async function checkForUpdate(currentVersion, fetchImpl = fetch) {
  const current = parseVersion(currentVersion);
  if (!current) return null;
  const res = await fetchImpl(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error('GitHub returned ' + res.status);
  const list = await res.json();
  let best = null;
  for (const rel of list) {
    const m = TAG.exec(rel.tag_name || '');
    if (!m || rel.draft || rel.prerelease) continue;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    const asset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    if (!asset) continue;
    if (!best || cmp(v, best.v) > 0) best = { v, rel, asset };
  }
  if (!best || cmp(best.v, current) <= 0) return null;
  return { version: best.v.join('.'), tag: best.rel.tag_name, url: best.asset.browser_download_url, notes: best.rel.body || '', size: best.asset.size };
}
