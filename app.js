// ═════════════════════════════════════════════════════════════════════
// CONFIG — GitHub-only, GitHub Pages deployment
// ═════════════════════════════════════════════════════════════════════
// Everything loads from GitHub. There is no local file support.
// The app MUST be accessed via https://USERNAME.github.io/REPO/ — NOT
// by double-clicking index.html.
//
// If you deploy to GitHub Pages, auto-detection reads owner/repo from
// the URL. You can leave GITHUB.owner/repo EMPTY.
//
// If you use a custom domain, fill GITHUB.owner + repo below.
// ═════════════════════════════════════════════════════════════════════

const CONFIG = {
  USE_CACHE: true,   // recommended — saves the file list after first load

  GITHUB: {
    owner:  '',      // leave empty on *.github.io
    repo:   '',      // leave empty on *.github.io
    branch: '',      // '' = default branch
    path:   'data'   // folder inside repo
  },

  DATASET_META: {
     DATASET_META: {
    'nepal_economy':   { icon: '💰', label: 'नेपालको अर्थतन्त्र', color: '#fbbf24' },
    'nepal_geography': { icon: '🏔️', label: 'नेपालको भूगोल',      color: '#10b981' },
    'universe':        { icon: '🌌', label: 'ब्रह्माण्ड',          color: '#a855f7' },
    'world_geography': { icon: '🌍', label: 'विश्व भूगोल',         color: '#38bdf8' },
    'world_history':   { icon: '🏛️', label: 'विश्व इतिहास',       color: '#f97316' }
  }
  }
};

// =====================================================================
// App begins
// =====================================================================
let DATASETS = [];
let datasetStatus = [];
let SOURCE_ERRORS = [];
let SOURCE_USED = null;

const USER_KEY = 'loksewa_custom_questions';
const CACHE_PREFIX = 'loksewa_cache_';
const BOOKMARK_KEY = 'loksewa_bookmarks';
const SORT_KEY = 'loksewa_sort_mode';
const PAGE_SIZE_KEY = 'loksewa_page_size';
const DEFAULT_CAT = 'General';

function cacheSet(name, value) {
  if (!CONFIG.USE_CACHE) return;
  try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(value)); } catch (e) {}
}
function cacheGet(name) {
  if (!CONFIG.USE_CACHE) return null;
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + name)); } catch (e) { return null; }
}
function clearOldCache() {
  if (CONFIG.USE_CACHE) return;
  try {
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

// ═══ GitHub target ═══
function githubTarget() {
  const g = CONFIG.GITHUB || {};
  if (g.owner && g.repo) {
    return { owner: g.owner, repo: g.repo, branch: g.branch || '', path: g.path || 'data' };
  }
  const host = location.hostname || '';
  if (/\.github\.io$/i.test(host)) {
    const seg = (location.pathname || '').split('/').filter(Boolean)[0];
    const repo = seg && !/\.html?$/i.test(seg) ? seg : host;
    return { owner: host.split('.')[0], repo, branch: g.branch || '', path: g.path || 'data' };
  }
  return null;
}

function datasetFromName(name, i, used) {
  const base = name.replace(/\.json$/i, '');
  const meta = CONFIG.DATASET_META[base] || {};
  let key = meta.key || base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ds' + i;
  while (used.has(key)) key += '-' + i;
  used.add(key);
  return {
    key,
    label: meta.label || base.replace(/[_-]+/g, ' '),
    icon: meta.icon,
    color: meta.color
  };
}

async function listGithubFolder(t) {
  const url = `https://api.github.com/repos/${t.owner}/${t.repo}/contents/${t.path}` +
    (t.branch ? `?ref=${encodeURIComponent(t.branch)}` : '');
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const msg =
      res.status === 404 ? `repo "${t.owner}/${t.repo}/${t.path}" भेटिएन — repo सार्वजनिक छ? data/ फोल्डर छ?` :
      res.status === 403 ? 'GitHub API rate limit (६०/घण्टा) — एकघण्टापछि प्रयास गर्नुहोस्। USE_CACHE: true राख्नुहोस्।' :
      res.status === 401 ? 'unauthorized — repo सार्वजनिक छ?' :
      'GitHub error ' + res.status;
    throw new Error(msg);
  }

  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`"${t.path}" फोल्डर होइन`);

  const used = new Set();
  const list = items
    .filter(f => f.type === 'file' && /\.json$/i.test(f.name) && f.download_url)
    .map((f, i) => ({ ...datasetFromName(f.name, i, used), url: f.download_url }));

  if (!list.length) {
    throw new Error(`"${t.owner}/${t.repo}/${t.path}" मा कुनै .json फाइल भेटिएन`);
  }
  return list;
}

async function loadManifest() {
  SOURCE_ERRORS = [];
  SOURCE_USED = null;

  // If opened from file:// → short-circuit with a clear message
  if (location.protocol === 'file:') {
    SOURCE_ERRORS.push({
      source: 'file://',
      error: 'यो app ले file:// बाट काम गर्दैन। GitHub Pages URL बाट खोल्नुहोस्।'
    });
    DATASETS = [];
    return;
  }

  const gh = githubTarget();
  if (!gh) {
    SOURCE_ERRORS.push({
      source: 'github',
      error: 'URL बाट repo detect गर्न सकिएन — app.js मा CONFIG.GITHUB.owner + repo भर्नुहोस्'
    });
    DATASETS = [];
    return;
  }

  try {
    const list = await listGithubFolder(gh);
    DATASETS = list.map(d => ({ ...d, icon: d.icon || '📄', label: d.label || d.key }));
    SOURCE_USED = 'github';
    try { cacheSet('manifest', DATASETS); } catch (e) {}
  } catch (e) {
    SOURCE_ERRORS.push({ source: 'github', error: (e && e.message) || 'failed' });
    // Offline fallback: cached list
    try {
      const cached = cacheGet('manifest');
      if (Array.isArray(cached) && cached.length) {
        DATASETS = cached;
        SOURCE_USED = 'cache';
      }
    } catch (e2) {}
  }
}

// ═══ Cache clear modal ═══
function openCacheClearModal() {
  document.getElementById('cacheCountUser').textContent = userQuestions.length;
  document.getElementById('cacheCountBookmarks').textContent = bookmarks.size;
  const defaults = { user: true, bookmarks: true, data: true, prefs: false };
  document.querySelectorAll('#cacheModal [data-cache]').forEach(cb => {
    cb.checked = !!defaults[cb.dataset.cache];
  });
  document.getElementById('cacheModal').classList.add('open');
}
function closeCacheModal() {
  document.getElementById('cacheModal').classList.remove('open');
}
function clearSelectedCaches() {
  const selected = new Set();
  document.querySelectorAll('#cacheModal [data-cache]:checked').forEach(cb => selected.add(cb.dataset.cache));
  if (!selected.size) return showToast('कृपया कम्तीमा एक विकल्प छान्नुहोस्', true);

  if (selected.has('user') && userQuestions.length > 0) {
    if (!confirm(`${userQuestions.length} प्रश्न स्थायी रूपमा मेटिन्छन्। पक्का हो?`)) return;
  }

  const cleared = [];
  if (selected.has('user')) { try { localStorage.removeItem(USER_KEY); cleared.push('प्रश्न'); } catch (e) {} }
  if (selected.has('bookmarks')) { try { localStorage.removeItem(BOOKMARK_KEY); cleared.push('बुकमार्क'); } catch (e) {} }
  if (selected.has('data')) {
    try {
      Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
      cleared.push('डेटा cache');
    } catch (e) {}
  }
  if (selected.has('prefs')) {
    try {
      localStorage.removeItem(SORT_KEY);
      localStorage.removeItem(PAGE_SIZE_KEY);
      cleared.push('Preferences');
    } catch (e) {}
  }
  closeCacheModal();
  showToast(`✅ ${cleared.join(', ')} सफा भयो — reload हुँदैछ…`);
  setTimeout(() => location.reload(), 900);
}
function hardResetAll() {
  if (!confirm('⚠️ सबै localStorage डेटा मेटिन्छ। फिर्ता हुँदैन। अगाडि बढ्ने?')) return;
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('loksewa_')) try { localStorage.removeItem(k); } catch (e) {}
    });
  } catch (e) {}
  closeCacheModal();
  showToast('⚠️ सबै reset भयो — reload हुँदैछ…');
  setTimeout(() => location.reload(), 900);
}

// ========== State ==========
let fileQuestions = [];
let userQuestions = [];
let allQuestions = [];
let activeSource = 'all';
let activeCategory = 'all';

let quizMode = false;
let quizQuestions = [];
let quizIndex = 0;
let quizAnswers = new Map();

// ========== DOM ==========
const $ = id => document.getElementById(id);
const searchInput = $('searchInput'), clearSearch = $('clearSearch');
const datasetSelect = $('datasetSelect'), filtersContainer = $('filters');
const listContainer = $('list'), emptyContainer = $('empty');
const totalCountEl = $('totalCount'), shownCountEl = $('shownCount');
const modal = $('modal'), modalTitle = $('modalTitle');
const qInput = $('qInput'), aInput = $('aInput'), catInput = $('catInput'), toastEl = $('toast');

// ========== Helpers ==========
const str = v => (v === undefined || v === null) ? '' : String(v);
const dsOf = key => DATASETS.find(d => d.key === key);

function escapeHtml(v) {
  return str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(item, sourceFile, fallbackId, custom) {
  const question = str(item.question ?? item.q ?? item['प्रश्न']).trim();
  const answer = str(item.answer ?? item.a ?? item['उत्तर']).trim();
  if (!question || !answer) return null;
  return {
    id: custom ? fallbackId : `${sourceFile}_${str(item.id) || fallbackId}`,
    question, answer,
    category: str(item.category ?? item.cat ?? item['श्रेणी']).trim() || DEFAULT_CAT,
    sourceFile,
    custom: !!custom,
    options: Array.isArray(item.options) ? item.options : undefined,
    answerIndex: typeof item.answerIndex === 'number' ? item.answerIndex : undefined
  };
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toastEl.className = 'toast'; }, 2800);
}

// ========== Sort ==========
let sortMode = 'newest';
let shuffleOrder = null;
try { sortMode = localStorage.getItem(SORT_KEY) || 'newest'; } catch (e) {}

function syncSortUI() { const sel = $('sortSelect'); if (sel) sel.value = sortMode; }

function sortQuestions(list) {
  const arr = [...list];
  switch (sortMode) {
    case 'az': return arr.sort((a, b) => a.question.localeCompare(b.question, 'ne'));
    case 'za': return arr.sort((a, b) => b.question.localeCompare(a.question, 'ne'));
    case 'category': return arr.sort((a, b) => a.category.localeCompare(b.category, 'ne') || a.question.localeCompare(b.question, 'ne'));
    case 'random': {
      if (!shuffleOrder) {
        shuffleOrder = allQuestions.map(q => q.id);
        for (let i = shuffleOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
        }
      }
      const idx = new Map(shuffleOrder.map((id, i) => [id, i]));
      return arr.sort((a, b) => (idx.has(a.id) ? idx.get(a.id) : Number.MAX_SAFE_INTEGER) - (idx.has(b.id) ? idx.get(b.id) : Number.MAX_SAFE_INTEGER));
    }
    default: return arr.sort((a, b) => (b.custom ? 1 : 0) - (a.custom ? 1 : 0));
  }
}

// ========== Bookmarks ==========
let bookmarks = new Set();
let showBookmarksOnly = false;
function loadBookmarks() { try { bookmarks = new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || []); } catch (e) { bookmarks = new Set(); } }
function saveBookmarks() { try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...bookmarks])); } catch (e) {} }
function toggleBookmark(id) { if (bookmarks.has(id)) bookmarks.delete(id); else bookmarks.add(id); saveBookmarks(); renderList(); }

// ========== Storage ==========
function loadUserQuestions() {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_KEY)) || [];
    userQuestions = saved.map((it, i) => normalize(it, str(it.sourceFile) || 'user', str(it.id) || 'user_' + Date.now() + '_' + i, true)).filter(Boolean);
  } catch (e) { userQuestions = []; }
}
function saveUserQuestions() { try { localStorage.setItem(USER_KEY, JSON.stringify(userQuestions)); } catch (e) {} }
function rebuildAll() { allQuestions = [...userQuestions, ...fileQuestions]; shuffleOrder = null; }

// ========== Load JSON files ═══ parallel, with per-file status ═══
async function loadDirectJsonFiles() {
  datasetStatus = [];

  // Progressive display: mark all pending first
  datasetStatus = DATASETS.map(ds => ({ ...ds, count: 0, ok: null, pending: true }));
  renderDatasetStatus();

  const results = await Promise.all(DATASETS.map(async ds => {
    try {
      const res = await fetch(ds.url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      if (!Array.isArray(raw)) {
        const status = datasetStatus.find(s => s.key === ds.key);
        if (status) { status.ok = false; status.error = 'JSON array होइन'; status.pending = false; }
        return [];
      }

      const qs = raw.map((item, i) => normalize(item, ds.key, i, false)).filter(Boolean);
      const status = datasetStatus.find(s => s.key === ds.key);
      if (status) { status.ok = true; status.count = qs.length; status.pending = false; }
      return qs;
    } catch (e) {
      const status = datasetStatus.find(s => s.key === ds.key);
      if (status) { status.ok = false; status.error = (e && e.message) || 'fetch failed'; status.pending = false; }
      return [];
    }
  }));

  fileQuestions = results.flat();
  rebuildAll();
  renderDatasetStatus();
}

// ========== Loaded Datasets panel ==========
function renderDatasetStatus() {
  const body = $('datasetBody');
  const countEl = $('datasetCount');
  if (!body || !countEl) return;

  const total = datasetStatus.length;
  const okCount = datasetStatus.filter(s => s.ok === true).length;
  const failCount = datasetStatus.filter(s => s.ok === false).length;
  const pendingCount = datasetStatus.filter(s => s.pending).length;
  const totalFileQs = datasetStatus.reduce((sum, s) => sum + (s.ok ? s.count : 0), 0);
  const userQs = userQuestions.length;

  const sourceLabel = {
    github: '🐙 GitHub',
    cache:  '💾 cache'
  }[SOURCE_USED] || null;

  // Empty state
  if (total === 0) {
    const isFile = location.protocol === 'file:';
    const tried = SOURCE_ERRORS.map(e =>
      `<div style="font-size:11px;color:var(--muted);margin:3px 0">
         • <b>${escapeHtml(e.source)}</b>: ${escapeHtml(e.error)}
       </div>`
    ).join('');

    let actionHtml = '';
    if (isFile) {
      actionHtml = `
        <div style="padding:14px;background:rgba(248,113,113,.08);border-radius:10px;margin-bottom:12px">
          <div style="font-weight:600;color:var(--danger);margin-bottom:8px">
            ⚠️ यो app ले file:// बाट काम गर्दैन
          </div>
          <div style="font-size:12px;line-height:1.8;color:var(--muted)">
            यो app <b>GitHub Pages</b> बाट चल्न डिजाइन गरिएको छ।
            <br><br>
            index.html double-click नगर्नुहोस्। तपाईंको GitHub Pages URL खोल्नुहोस्:
            <br><br>
            <code style="background:rgba(255,255,255,.06);padding:6px 10px;border-radius:4px;display:inline-block;font-size:12px;color:var(--accent)">https://USERNAME.github.io/REPO/</code>
            <br><br>
            Pages enable गर्न: repo → Settings → Pages → Branch <b>main</b> → <b>/(root)</b> → Save
          </div>
        </div>
      `;
    }

    countEl.textContent = userQs > 0 ? `0 · ${userQs} local` : '0';
    countEl.className = 'none';

    body.innerHTML = `
      <div class="dataset-empty" style="text-align:left">
        <div style="font-weight:600;color:var(--danger);margin-bottom:10px;text-align:center">
          ⚠️ कुनै JSON फाइल लोड भएन
        </div>
        ${actionHtml}
        ${tried ? `
          <div style="font-size:12px;line-height:1.7;margin-bottom:12px">
            <b>प्रयास गरिएका स्रोतहरू:</b>
            ${tried}
          </div>
        ` : ''}
        ${userQs > 0 ? `
          <div style="padding:12px;background:rgba(56,189,248,.08);border-radius:8px;font-size:12px;line-height:1.7">
            <b style="color:var(--accent)">ℹ️ तपाईंले देखिरहेका ${userQs} प्रश्न</b>
            localStorage बाट आएका हुन् (+ थपेका वा ⬆ आयात गरेका)।
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  // Header count
  const badgeClass = failCount === 0 && pendingCount === 0 ? '' : failCount === total ? 'none' : 'partial';
  if (pendingCount > 0) {
    countEl.textContent = `लोड हुँदै… ${total - pendingCount}/${total}`;
  } else {
    countEl.textContent = `${okCount}/${total} · ${totalFileQs} प्रश्न`;
  }
  countEl.className = badgeClass;

  const sourceBadge = sourceLabel
    ? `<div style="padding:6px 14px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--border);background:rgba(56,189,248,.04)">
         स्रोत: ${sourceLabel}
       </div>`
    : '';

  const rows = datasetStatus.map(s => {
    const fileName = s.file || s.url || s.key;
    const shortName = fileName.split('/').pop() || fileName;
    let cls = 'ok';
    let countText;
    if (s.pending) { cls = ''; countText = '⏳ लोड…'; }
    else if (s.ok) { cls = 'ok'; countText = s.count + ' प्रश्न'; }
    else { cls = 'fail'; countText = s.error || 'failed'; }
    return `
      <div class="dataset-row ${cls}">
        <span class="ds-icon">${s.ok ? (s.icon || '📄') : s.pending ? '⏳' : '❌'}</span>
        <div class="ds-info">
          <div class="ds-label">${escapeHtml(s.label)}</div>
          <div class="ds-file">${escapeHtml(shortName)}</div>
        </div>
        <span class="ds-count">${escapeHtml(countText)}</span>
      </div>
    `;
  }).join('');

  const userRow = userQs > 0 ? `
    <div class="dataset-row ok" style="border-top:2px solid var(--border);opacity:.85;background:rgba(34,197,94,.03)">
      <span class="ds-icon">💾</span>
      <div class="ds-info">
        <div class="ds-label">तपाईंका प्रश्न</div>
        <div class="ds-file">localStorage (browser)</div>
      </div>
      <span class="ds-count">${userQs} प्रश्न</span>
    </div>
  ` : '';

  body.innerHTML = sourceBadge + rows + userRow;
}

function toggleDatasetPanel() {
  const body = $('datasetBody');
  const btn = $('datasetToggle');
  if (!body || !btn) return;
  const collapsed = body.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▼' : '▲';
}

async function refreshDatasets() {
  showToast('रीफ्रेस गर्दै…');
  try {
    await loadManifest();
    buildDatasetSelect();
    await loadDirectJsonFiles();
    renderFilters();
    renderList();
    if (DATASETS.length) showToast(`✅ ${DATASETS.length} फाइल लोड भयो · ${fileQuestions.length} प्रश्न`);
    else showToast('कुनै फाइल भेटिएन', true);
  } catch (e) {
    showToast('रीफ्रेस त्रुटि: ' + ((e && e.message) || e), true);
  }
}

// ========== Browse UI ==========
function buildDatasetSelect() {
  datasetSelect.innerHTML = '<option value="all">📁 सबै डाटासेटहरू</option>' +
    DATASETS.map(d => `<option value="${d.key}">${escapeHtml(d.icon + ' ' + d.label)}</option>`).join('');
  datasetSelect.value = activeSource;
}

function handleDatasetChange() { activeSource = datasetSelect.value; activeCategory = 'all'; currentPage = 1; renderFilters(); renderList(); }

function renderFilters() {
  const cats = new Set();
  allQuestions.forEach(it => { if (activeSource === 'all' || it.sourceFile === activeSource) cats.add(it.category); });
  if (activeCategory !== 'all' && !cats.has(activeCategory)) activeCategory = 'all';
  filtersContainer.innerHTML = '';
  const makeChip = (value, text) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (activeCategory === value ? ' active' : '');
    chip.textContent = text;
    chip.onclick = () => { activeCategory = value; currentPage = 1; renderFilters(); renderList(); };
    filtersContainer.appendChild(chip);
  };
  makeChip('all', 'सबै (All Categories)');
  [...cats].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).forEach(c => makeChip(c, c));
}

function buildModalCats() {
  catInput.innerHTML = DATASETS.map(d => {
    const cats = new Set([DEFAULT_CAT]);
    allQuestions.forEach(it => { if (it.sourceFile === d.key) cats.add(it.category); });
    return `<optgroup label="${escapeHtml(d.icon + ' ' + d.label)}">` +
      [...cats].map(c => `<option value="${escapeHtml(d.key + '::' + c)}">${escapeHtml(c)}</option>`).join('') +
      '</optgroup>';
  }).join('');
  if (!DATASETS.length) {
    catInput.innerHTML = `<option value="user::${DEFAULT_CAT}">${DEFAULT_CAT}</option>`;
  }
}

// ========== Pagination ==========
const PAGE_PRESETS = [10, 20, 50, 100];
let pageSize = loadPageSize();
let currentPage = 1;
let pageCount = 1;

function loadPageSize() { try { const v = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10); if (v === 0 || (v >= 1 && v <= 500)) return v; } catch (e) {} return 20; }
function savePageSize() { try { localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)); } catch (e) {} }
function syncPageSizeUI() {
  const sel = $('pageSizeSelect'), cus = $('pageSizeCustom');
  if (!sel || !cus) return;
  sel.value = pageSize === 0 ? '0' : PAGE_PRESETS.includes(pageSize) ? String(pageSize) : 'custom';
  cus.style.display = sel.value === 'custom' ? 'inline-block' : 'none';
  if (sel.value === 'custom') cus.value = pageSize;
}
function afterPageSizeChange(syncUI) { currentPage = 1; savePageSize(); if (syncUI) syncPageSizeUI(); renderList(); }

function renderPager(total, pages, start, count) {
  pageCount = pages;
  const info = $('rangeInfo');
  if (info) info.textContent = total ? `${start + 1}–${start + count} / ${total}` : '';
  const first = currentPage <= 1 ? 'disabled' : '';
  const last = currentPage >= pages ? 'disabled' : '';
  const html = total && pages > 1
    ? `<button data-pg="first" ${first}>«</button><button data-pg="prev" ${first}>‹ अघिल्लो</button>` +
      `<span class="pg-info">पेज <input type="number" class="pg-input" min="1" max="${pages}" value="${currentPage}" data-pg-input> / ${pages}</span>` +
      `<button data-pg="next" ${last}>अर्को ›</button><button data-pg="last" ${last}>»</button>`
    : '';
  ['pagerTop', 'pagerBottom'].forEach(id => { const el = $(id); if (el) el.innerHTML = html; });
}
function scrollToToolbar() { const t = $('toolbar'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function onPagerClick(e) {
  const b = e.target.closest ? e.target.closest('[data-pg]') : null;
  if (!b || b.disabled) return;
  const a = b.dataset.pg;
  if (a === 'first') currentPage = 1; else if (a === 'prev') currentPage--; else if (a === 'next') currentPage++; else if (a === 'last') currentPage = pageCount;
  renderList(); scrollToToolbar();
}
function onPagerChange(e) { if (!e.target.matches || !e.target.matches('[data-pg-input]')) return; const v = parseInt(e.target.value, 10); if (v) currentPage = v; renderList(); scrollToToolbar(); }
function setupPaging() {
  const sel = $('pageSizeSelect'), cus = $('pageSizeCustom');
  syncPageSizeUI();
  if (sel && cus) {
    sel.addEventListener('change', () => { pageSize = sel.value === 'custom' ? (parseInt(cus.value, 10) || 25) : parseInt(sel.value, 10); afterPageSizeChange(true); });
    cus.addEventListener('input', () => { const n = parseInt(cus.value, 10); if (n >= 1) { pageSize = Math.min(n, 500); afterPageSizeChange(false); } });
  }
  ['pagerTop', 'pagerBottom'].forEach(id => { const el = $(id); if (!el) return; el.addEventListener('click', onPagerClick); el.addEventListener('change', onPagerChange); });
}

function showSkeleton() {
  listContainer.innerHTML =
    '<div class="skeleton-card" style="height:110px"></div>' +
    '<div class="skeleton-card" style="height:130px"></div>' +
    '<div class="skeleton-card" style="height:118px"></div>';
  emptyContainer.style.display = 'none';
  totalCountEl.textContent = '…';
  shownCountEl.textContent = '…';
  renderPager(0, 1, 0, 0);
}

function renderList() {
  if (quizMode) return;
  const query = searchInput.value.toLowerCase().trim();
  let filtered = allQuestions.filter(it =>
    (activeSource === 'all' || it.sourceFile === activeSource) &&
    (activeCategory === 'all' || it.category === activeCategory) &&
    (!showBookmarksOnly || bookmarks.has(it.id)) &&
    (!query || it.question.toLowerCase().includes(query) || it.answer.toLowerCase().includes(query) || it.category.toLowerCase().includes(query)));
  filtered = sortQuestions(filtered);
  totalCountEl.textContent = allQuestions.length;
  shownCountEl.textContent = filtered.length;
  listContainer.innerHTML = '';

  if (!filtered.length) {
    emptyContainer.style.display = 'block';
    emptyContainer.innerHTML = showBookmarksOnly
      ? 'अहिलेसम्म कुनै बुकमार्क छैन।<br><small>★ आइकन क्लिक गरेर बुकमार्क गर्नुहोस्।</small>'
      : 'कुनै प्रश्न भेटिएन।<br><small>माथिको "लोड भएका डाटासेटहरू" प्यानल जाँच्नुहोस्।</small>';
    renderPager(0, 1, 0, 0);
    return;
  }
  emptyContainer.style.display = 'none';

  const size = pageSize > 0 ? pageSize : filtered.length;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  currentPage = Math.min(Math.max(1, currentPage), pages);
  const start = (currentPage - 1) * size;
  const pageItems = filtered.slice(start, start + size);
  renderPager(filtered.length, pages, start, pageItems.length);

  pageItems.forEach(it => {
    const ds = dsOf(it.sourceFile);
    const isBm = bookmarks.has(it.id);
    const card = document.createElement('div');
    card.className = 'card ' + (it.custom ? 'user-card' : `${it.sourceFile}-card`);
    if (!it.custom && ds && ds.color) card.style.borderLeft = '4px solid ' + ds.color;
    card.innerHTML = `
      <div class="card-top">
        <div class="q">${escapeHtml(it.question)}</div>
        <button class="bookmark-btn ${isBm ? 'active' : ''}" data-bm="1" title="${isBm ? 'बुकमार्क हटाउनुहोस्' : 'बुकमार्क गर्नुहोस्'}">${isBm ? '★' : '☆'}</button>
      </div>
      <div class="a">${escapeHtml(it.answer)}</div>
      <div class="meta">
        <div><span class="tag">${escapeHtml(it.category)}</span><span class="source-badge">${it.custom ? '✍️ ' : ''}${escapeHtml(ds ? ds.label : 'Custom')}</span></div>
        <div class="actions">
          ${it.custom ? '<button class="edit-btn" data-edit="1">✎ सम्पादन</button>' : ''}
        </div>
      </div>`;
    card.querySelector('[data-bm]').onclick = () => toggleBookmark(it.id);
    const edit = card.querySelector('[data-edit]'); if (edit) edit.onclick = () => openEditModal(it.id);
    listContainer.appendChild(card);
  });
}

// ========== Add / edit ==========
let editingId = null;
function openAddModal() {
  editingId = null; buildModalCats();
  modalTitle.textContent = 'नयाँ प्रश्न थप्नुहोस्';
  qInput.value = ''; aInput.value = '';
  const dsKey = activeSource !== 'all' ? activeSource : (DATASETS[0] ? DATASETS[0].key : 'user');
  const want = dsKey + '::' + (activeCategory !== 'all' ? activeCategory : DEFAULT_CAT);
  const opts = [...catInput.options];
  const pick = opts.find(o => o.value === want) || opts.find(o => o.value.startsWith(dsKey + '::'));
  if (pick) catInput.value = pick.value;
  modal.classList.add('open');
  setTimeout(() => qInput.focus(), 50);
}
function openEditModal(id) {
  const it = userQuestions.find(q => q.id === id);
  if (!it) return;
  editingId = id; buildModalCats();
  modalTitle.textContent = 'प्रश्न सम्पादन गर्नुहोस्';
  qInput.value = it.question; aInput.value = it.answer;
  const want = it.sourceFile + '::' + it.category;
  const opts = [...catInput.options];
  const pick = opts.find(o => o.value === want) || opts.find(o => o.value.startsWith(it.sourceFile + '::'));
  if (pick) catInput.value = pick.value;
  modal.classList.add('open');
  setTimeout(() => { qInput.focus(); qInput.select(); }, 50);
}
function closeModal() { modal.classList.remove('open'); editingId = null; }

function saveItem() {
  const q = qInput.value.trim(), a = aInput.value.trim();
  if (!q || !a) return showToast('कृपया प्रश्न र उत्तर दुवै भर्नुहोस्!', true);
  const [sourceFile, ...rest] = catInput.value.split('::');
  const category = rest.join('::') || DEFAULT_CAT;
  const dup = allQuestions.find(it => it.id !== editingId && it.question.toLowerCase().trim() === q.toLowerCase().trim());
  if (dup) {
    const msg = editingId
      ? `अर्को प्रश्न सँग मिल्ने देखियो:\n\n"${dup.question}"\n\nफेरि पनि सुरक्षित गर्ने?`
      : `यो प्रश्न पहिले नै छ:\n\n"${dup.question}"\n\nफेरि पनि थप्ने?`;
    if (!confirm(msg)) return;
  }
  const wasEditing = !!editingId;
  if (wasEditing) {
    const i = userQuestions.findIndex(it => it.id === editingId);
    if (i > -1) userQuestions[i] = { ...userQuestions[i], question: q, answer: a, category, sourceFile };
  } else {
    userQuestions.unshift({ id: 'user_' + Date.now(), question: q, answer: a, category, sourceFile, custom: true });
  }
  saveUserQuestions(); rebuildAll(); closeModal(); renderFilters(); renderList();
  renderDatasetStatus();
  showToast(wasEditing ? 'प्रश्न अपडेट भयो!' : 'सफलतापूर्वक थपियो!');
}

// ========== Export / import ==========
function exportData() {
  if (!userQuestions.length) return showToast('निर्यात गर्नका लागि कुनै थपिएको प्रश्न छैन!', true);
  const out = userQuestions.map(({ question, answer, category, sourceFile }) => ({ q: question, a: answer, cat: category, dataset: sourceFile }));
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'loksewa_custom_questions.json';
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
  showToast('JSON फाइल डाउनलोड गरियो!');
}

function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) return showToast('अमान्य JSON ढाँचा!', true);
      const seen = new Set(allQuestions.map(x => x.question.toLowerCase().trim()));
      let added = 0;
      imported.forEach((it, i) => {
        const key = str(it.dataset ?? it.sourceFile);
        const target = dsOf(key) ? key : (activeSource !== 'all' ? activeSource : (DATASETS[0] ? DATASETS[0].key : 'user'));
        const n = normalize(it, target, 'user_' + Date.now() + '_' + i, true);
        if (!n || seen.has(n.question.toLowerCase().trim())) return;
        seen.add(n.question.toLowerCase().trim());
        userQuestions.push(n); added++;
      });
      saveUserQuestions(); rebuildAll(); renderFilters(); renderList();
      renderDatasetStatus();
      showToast(`${added} नयाँ प्रश्न इम्पोर्ट गरियो!`);
    } catch (err) { showToast('फाइल पढ्न सकिएन!', true); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ========== QUIZ MODE ==========
function updateModeUI() {
  document.body.classList.toggle('quiz-mode', quizMode);
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', (tab.dataset.mode === 'quiz') === quizMode);
  });
  [searchInput, clearSearch, datasetSelect, $('sortSelect'), $('pageSizeSelect'), $('pageSizeCustom'), $('bookmarkFilter')].forEach(el => {
    if (el) el.disabled = quizMode;
  });
}

function buildQuizPool() {
  const query = searchInput.value.toLowerCase().trim();
  return allQuestions.filter(it =>
    (activeSource === 'all' || it.sourceFile === activeSource) &&
    (activeCategory === 'all' || it.category === activeCategory) &&
    (!showBookmarksOnly || bookmarks.has(it.id)) &&
    (!query || it.question.toLowerCase().includes(query) || it.answer.toLowerCase().includes(query) || it.category.toLowerCase().includes(query)));
}

function startQuiz() {
  const pool = buildQuizPool();
  if (!pool.length) {
    showToast('क्विजका लागि प्रश्न भेटिएन', true);
    quizMode = false; updateModeUI();
    return;
  }
  shuffleInPlace(pool);
  const built = [];
  for (const q of pool) {
    const mcq = buildMcq(q, allQuestions);
    if (mcq) built.push({ question: q, mcq });
    if (built.length >= 20) break;
  }
  if (!built.length) {
    showToast('क्विजका लागि पर्याप्त प्रश्न भेटिएन (कम्तीमा ४ फरक उत्तर चाहिन्छ)', true);
    quizMode = false; updateModeUI();
    return;
  }
  quizQuestions = built;
  quizIndex = 0;
  quizAnswers = new Map();
  renderQuiz();
}

function renderQuiz() {
  const container = $('quizCard');
  if (!container) return;

  if (quizIndex >= quizQuestions.length) { renderQuizResult(); return; }

  const { question, mcq } = quizQuestions[quizIndex];
  const picked = quizAnswers.has(question.id) ? quizAnswers.get(question.id) : -1;
  const answered = picked !== -1;

  $('quizNum').textContent = quizIndex + 1;
  $('quizTotal').textContent = quizQuestions.length;

  let correctCount = 0;
  quizAnswers.forEach((p, id) => {
    const item = quizQuestions.find(x => x.question.id === id);
    if (item && item.mcq.correctIndex === p) correctCount++;
  });
  $('quizScore').textContent = correctCount;
  $('quizProgressBar').style.width = ((quizIndex) / quizQuestions.length * 100) + '%';

  const keys = ['क', 'ख', 'ग', 'घ', 'ङ'];

  container.innerHTML = `
    <div class="quiz-card">
      <div style="margin-bottom:10px"><span class="tag">${escapeHtml(question.category)}</span></div>
      <div class="quiz-q-text">${escapeHtml(question.question)}</div>
      <div class="quiz-options">
        ${mcq.options.map((opt, i) => {
          let cls = 'quiz-opt';
          if (answered) {
            if (i === mcq.correctIndex) cls += ' correct';
            else if (i === picked) cls += ' wrong';
          }
          return `<button class="${cls}" data-qi="${i}" ${answered ? 'disabled' : ''}>
            <span class="qkey">${keys[i] || ''}</span>
            <span>${escapeHtml(opt)}</span>
          </button>`;
        }).join('')}
      </div>
      ${answered ? `<div class="quiz-feedback">${picked === mcq.correctIndex
        ? '✅ सही उत्तर!'
        : '❌ गलत — सही उत्तर: <b>' + escapeHtml(mcq.options[mcq.correctIndex]) + '</b>'}</div>` : ''}
    </div>
    <div class="quiz-nav">
      ${answered ? `<button class="quiz-next" id="quizNextBtn">${quizIndex === quizQuestions.length - 1 ? 'नतिजा हेर्नुहोस् →' : 'अर्को →'}</button>` : ''}
    </div>
  `;

  container.querySelectorAll('[data-qi]').forEach(btn => {
    btn.onclick = () => {
      if (quizAnswers.has(question.id)) return;
      quizAnswers.set(question.id, parseInt(btn.dataset.qi, 10));
      renderQuiz();
    };
  });

  const nextBtn = $('quizNextBtn');
  if (nextBtn) nextBtn.onclick = () => { quizIndex++; renderQuiz(); };
}

function renderQuizResult() {
  const correct = quizQuestions.filter(q => {
    const p = quizAnswers.get(q.question.id);
    return p !== undefined && p === q.mcq.correctIndex;
  }).length;
  const total = quizQuestions.length;
  const pct = Math.round(correct / total * 100);

  let msg = '';
  if (pct >= 80) msg = '🎉 उत्कृष्ट!';
  else if (pct >= 60) msg = '👍 राम्रो!';
  else if (pct >= 40) msg = '💪 अझै अभ्यास चाहिन्छ।';
  else msg = '📚 अभ्यास जारी राख्नुहोस्।';

  const wrong = quizQuestions.filter(q => {
    const p = quizAnswers.get(q.question.id);
    return p !== undefined && p !== q.mcq.correctIndex;
  });

  $('quizProgressBar').style.width = '100%';
  $('quizNum').textContent = total;
  $('quizTotal').textContent = total;
  $('quizScore').textContent = correct;

  const container = $('quizCard');
  container.innerHTML = `
    <div class="quiz-result">
      <div class="score">${correct} / ${total}</div>
      <div class="score-label">${pct}% सही</div>
      <div class="msg">${msg}</div>
      <div class="actions">
        <button class="btn-success" id="quizRestartBtn" style="padding:10px 20px">↺ फेरि सुरु</button>
        <button class="btn-outline" id="quizExitBtn" style="padding:10px 20px">बाहिर निस्कने</button>
      </div>
      ${wrong.length ? `
        <div class="quiz-review">
          <h3>❌ गलत उत्तरहरू (${wrong.length})</h3>
          ${wrong.map(({ question, mcq }) => {
            const picked = quizAnswers.get(question.id);
            return `
              <div class="quiz-review-item">
                <div class="q">${escapeHtml(question.question)}</div>
                <div class="a wrong">✗ ${escapeHtml(mcq.options[picked] || '—')}</div>
                <div class="a correct">✓ ${escapeHtml(mcq.options[mcq.correctIndex])}</div>
                <span class="tag">${escapeHtml(question.category)}</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;

  $('quizRestartBtn').onclick = () => startQuiz();
  $('quizExitBtn').onclick = () => exitQuiz();
}

function enterQuiz() {
  quizMode = true;
  updateModeUI();
  startQuiz();
}
function exitQuiz() {
  quizMode = false;
  updateModeUI();
  renderList();
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  searchInput.addEventListener('input', () => {
    clearSearch.style.display = searchInput.value ? 'block' : 'none';
    currentPage = 1; renderList();
  });
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    currentPage = 1; renderList();
  });
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  setupPaging();

  datasetSelect.addEventListener('change', handleDatasetChange);
  $('addBtn').addEventListener('click', openAddModal);
  $('cancelBtn').addEventListener('click', closeModal);
  $('saveBtn').addEventListener('click', saveItem);
  $('exportBtn').addEventListener('click', exportData);
  $('importFile').addEventListener('change', importData);

  $('datasetToggle').addEventListener('click', toggleDatasetPanel);
  $('datasetRefresh').addEventListener('click', refreshDatasets);

  $('clearCacheBtn').addEventListener('click', openCacheClearModal);
  $('cacheCancelBtn').addEventListener('click', closeCacheModal);
  $('cacheClearBtn').addEventListener('click', clearSelectedCaches);
  $('cacheHardReset').addEventListener('click', e => { e.preventDefault(); hardResetAll(); });
  $('cacheModal').addEventListener('click', e => { if (e.target === $('cacheModal')) closeCacheModal(); });

  syncSortUI();
  $('sortSelect').addEventListener('change', e => {
    sortMode = e.target.value;
    try { localStorage.setItem(SORT_KEY, sortMode); } catch (err) {}
    shuffleOrder = null; currentPage = 1; renderList();
  });

  const bf = $('bookmarkFilter');
  bf.classList.toggle('active', showBookmarksOnly);
  bf.addEventListener('click', () => {
    showBookmarksOnly = !showBookmarksOnly;
    bf.classList.toggle('active', showBookmarksOnly);
    currentPage = 1; renderList();
  });

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const wantQuiz = tab.dataset.mode === 'quiz';
      if (wantQuiz && !quizMode) enterQuiz();
      else if (!wantQuiz && quizMode) exitQuiz();
    });
  });

  $('quizRestartTop').addEventListener('click', () => { if (quizMode) startQuiz(); });

  clearOldCache();
  loadUserQuestions();
  loadBookmarks();
  showSkeleton();

  $('datasetCount').textContent = '…';
  $('datasetBody').innerHTML = '<div class="dataset-empty">GitHub बाट फाइल सूची लोड हुँदै…</div>';

  try {
    await loadManifest();
    buildDatasetSelect();
    await loadDirectJsonFiles();
    renderFilters();
    renderList();
    if (fileQuestions.length) {
      showToast(`✅ ${fileQuestions.length} प्रश्न लोड भयो (${DATASETS.length} फाइल)`);
    }
  } catch (e) {
    listContainer.innerHTML = '';
    $('datasetBody').innerHTML = '<div class="dataset-empty" style="color:var(--danger)">लोड त्रुटि: ' + escapeHtml((e && e.message) || e) + '</div>';
    showToast('लोड गर्दा त्रुटि: ' + ((e && e.message) || e), true);
  }
});
