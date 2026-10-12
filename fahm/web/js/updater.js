// Looks for a newer Fahm build on GitHub. Only releases tagged "fahm-v<version>" count, because the repository
// may host other apps too. Versions are dotted numbers (the build date, e.g. 26.10.12.1530) compared piece by piece.

const TAG = /^fahm-v(\d+(?:\.\d+){1,4})$/;

export function parseVersion(text) {
  const m = /^v?(\d+(?:\.\d+){1,4})$/.exec(text || '');
  return m ? m[1].split('.').map(Number) : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** -> {version, tag, url, notes, size} when a newer build exists, else null. */
export async function checkForUpdate(currentVersion, { repo = 'sh11fty/Kollectibles', fetchImpl = fetch } = {}) {
  const current = parseVersion(currentVersion);
  if (!current) return null;
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error('GitHub returned ' + res.status);
  const list = await res.json();
  let best = null;
  for (const rel of list) {
    const m = TAG.exec(rel.tag_name || '');
    if (!m || rel.draft || rel.prerelease) continue;
    const v = m[1].split('.').map(Number);
    const asset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    if (!asset) continue;
    if (!best || compareVersions(v, best.v) > 0) best = { v, rel, asset };
  }
  if (!best || compareVersions(best.v, current) <= 0) return null;
  return { version: best.v.join('.'), tag: best.rel.tag_name, url: best.asset.browser_download_url, notes: best.rel.body || '', size: best.asset.size };
}
