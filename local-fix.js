/* local-fix.js — load this AFTER app.js (see index.html line at the bottom).
   What it does:
   1. Reads your JSON files locally with a normal fetch (localhost / LAN / even file:// if the browser allows it).
      Order: data/ folder listing  ->  data/manifest.json  ->  LOCAL_FILES below.
   2. Removes the "pick files / folder" upload option and never skips the network on file://.
   Everything else in app.js (quiz, bookmarks, sort, pagination, GitHub, Drive...) is untouched. */

// Files inside data/ to try when the server cannot list the folder (add one name per file).
CONFIG.LOCAL_FILES = ['universe_questions_nasu_merged.json'];

// ---------- 1. Local discovery ----------
async function listLocalFolder() {
  const folders = (CONFIG.LOCAL_FOLDERS && CONFIG.LOCAL_FOLDERS.length) ? CONFIG.LOCAL_FOLDERS : ['data/'];
  const withSlash = p => p.replace(/\/?$/, '/');
  const base = withSlash(folders[0]);
  const toDatasets = paths => {
    const used = new Set();
    return paths.map((p, i) => ({ ...datasetFromName(p.split('/').pop(), i, used), file: p }));
  };

  // a) directory listing (python -m http.server, npx serve, ...)
  for (const folder of folders) {
    try {
      const res = await fetch(folder, { cache: 'no-store' });
      if (!res.ok) continue;
      if ((res.headers.get('content-type') || '').toLowerCase().includes('json')) continue;
      const html = await res.text();
      const names = new Set();
      const re = /href\s*=\s*["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        let href = m[1].split('?')[0].split('#')[0];
        try { href = decodeURIComponent(href); } catch (e) {}
        const file = href.split('/').pop();
        if (/\.json$/i.test(file) && !/^manifest\.json$/i.test(file)) names.add(file);
      }
      if (names.size) return toDatasets([...names].map(n => withSlash(folder) + n));
    } catch (e) { /* try next */ }
  }

  // b) data/manifest.json  ->  ["a.json", "b.json"]  or  [{"file":"a.json"}]
  try {
    const res = await fetch(base + 'manifest.json', { cache: 'no-store' });
    if (res.ok) {
      const list = await res.json();
      const names = (Array.isArray(list) ? list : (list && list.files) || [])
        .map(x => typeof x === 'string' ? x : (x && (x.file || x.name)))
        .filter(n => n && /\.json$/i.test(n))
        .map(n => n.split('/').pop());
      if (names.length) return toDatasets(names.map(n => base + n));
    }
  } catch (e) { /* ignore */ }

  // c) explicit list — only files that really exist are used, so a missing local folder
  //    falls through to GitHub / Drive instead of showing broken entries
  const fixed = (CONFIG.LOCAL_FILES || []).map(n => base + String(n).split('/').pop());
  const found = (await Promise.all(fixed.map(async p => {
    try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? p : null; } catch (e) { return null; }
  }))).filter(Boolean);
  return found.length ? toDatasets(found) : null;
}

// ---------- 2. Source order (same as before, minus the file:// shortcut and picker) ----------
async function loadManifest() {
  SOURCE_ERRORS = [];
  SOURCE_USED = null;
  const finish = (list, id) => {
    DATASETS = list.map(d => ({ ...d, icon: d.icon || '📄', label: d.label || d.key }));
    SOURCE_USED = id;
    try { cacheSet('manifest', DATASETS); } catch (e) {}
  };

  // 1) Apps Script
  if (CONFIG.SCRIPT_URL) {
    try {
      const n = await loadFromScript();
      if (n > 0) { SOURCE_USED = 'script'; DATASETS = DATASETS.map(d => ({ ...d, icon: d.icon || '📄', label: d.label || d.key })); return; }
      SOURCE_ERRORS.push({ source: 'script', error: 'no files' });
    } catch (e) { SOURCE_ERRORS.push({ source: 'script', error: (e && e.message) || 'failed' }); }
  }

  // 2) Local data/ folder (localhost, LAN, or file:// when the browser allows it)
  if (isLocalHost() || isFileProtocol()) {
    try {
      const list = await listLocalFolder();
      if (list && list.length) { finish(list, 'local'); return; }
      SOURCE_ERRORS.push({ source: 'local', error: 'no .json found in data/' });
    } catch (e) { SOURCE_ERRORS.push({ source: 'local', error: (e && e.message) || 'failed' }); }
  }

  // 3) GitHub
  const gh = githubTarget();
  if (gh) {
    try { finish(await listGithubFolder(gh), 'github'); return; }
    catch (e) { SOURCE_ERRORS.push({ source: 'github', error: (e && e.message) || 'failed' }); }
  } else if (!CONFIG.GITHUB.owner) {
    SOURCE_ERRORS.push({ source: 'github', error: 'not configured' });
  }

  // 4) Drive
  if (CONFIG.DRIVE_FOLDER_ID && CONFIG.DRIVE_API_KEY) {
    try { finish(await listDriveFolder(), 'drive'); return; }
    catch (e) { SOURCE_ERRORS.push({ source: 'drive', error: (e && e.message) || 'failed' }); }
  }

  // 5) Manifest URL
  if (CONFIG.MANIFEST_URL) {
    try { finish(await listFromManifest(), 'manifest'); return; }
    catch (e) { SOURCE_ERRORS.push({ source: 'manifest', error: (e && e.message) || 'failed' }); }
  }

  // 6) Cache
  try {
    const cached = cacheGet('manifest');
    if (Array.isArray(cached) && cached.length) { DATASETS = cached; SOURCE_USED = 'cache'; return; }
  } catch (e) {}

  DATASETS = [];
  SOURCE_USED = null;
}

// ---------- 3. No file-picker / upload ----------
async function refreshDatasets() {
  showToast('रीफ्रेस गर्दै…');
  try {
    await loadManifest();
    buildDatasetSelect();
    await loadWithPassword();
    renderFilters();
    renderList();
    renderDatasetStatus();
    showToast('✅ रीफ्रेस भयो');
  } catch (e) {
    showToast('रीफ्रेस त्रुटि: ' + ((e && e.message) || e), true);
  }
}
async function loadFromPickedFiles() { await refreshDatasets(); }   // kept only so old references still work

const _renderDatasetStatusOriginal = renderDatasetStatus;
renderDatasetStatus = function () {
  _renderDatasetStatusOriginal();
  const body = document.getElementById('datasetBody');
  if (!body) return;
  const pick = document.getElementById('pickFilesBtn');
  if (pick && pick.parentElement) pick.parentElement.remove();     // remove the "pick files/folder" box
  const again = document.getElementById('reloadFilesBtn');
  if (again) again.remove();                                       // remove "pick again" button
  if (isFileProtocol() && (!datasetStatus.length || datasetStatus.some(s => !s.ok))) {
    body.insertAdjacentHTML('beforeend',
      '<div style="padding:12px 14px;font-size:12px;line-height:1.7;color:var(--muted);border-top:1px solid var(--border)">' +
      '⚠️ Double-click (file://) बाट browser ले local JSON पढ्न दिँदैन।<br>' +
      'App को folder भित्र <code style="background:rgba(255,255,255,.06);padding:1px 5px;border-radius:3px">python -m http.server</code> ' +
      'चलाएर <code style="background:rgba(255,255,255,.06);padding:1px 5px;border-radius:3px">http://localhost:8000</code> खोल्नुहोस्।</div>');
  }
};
