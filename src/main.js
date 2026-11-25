import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseInventoryPdf, needsScan, titleCase } from './parser.js';
import { qrSvg, escapeHtml as e } from './qr.js';
import { renderPrint } from './print.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SITE = 'mpl.nicholasbrown.me';
const $ = (id) => document.getElementById(id);

// ---------- Preferences ----------
const PREF_KEY = 'mpl-scan:prefs';
const defaults = { theme: 'auto', view: 'cards', layout: 'grid', size: 'M', sort: 'report' };
function loadPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { ...defaults }; }
}
function savePrefs() {
  try {
    const { theme, view, layout, size, sort } = state;
    localStorage.setItem(PREF_KEY, JSON.stringify({ theme, view, layout, size, sort }));
  } catch { /* private mode etc. */ }
}

const state = {
  ...loadPrefs(),
  files: [],      // [{ name, meta }]
  rows: [],       // all parsed rows
  meta: {},       // merged meta
  excluded: new Set(),
  query: '',
};

// ---------- Theme ----------
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = {
  auto: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
  const label = state.theme[0].toUpperCase() + state.theme.slice(1);
  $('themeIcon').innerHTML = THEME_ICON[state.theme];
  $('themeLabel').textContent = label;
  $('themeBtn').setAttribute('aria-label', `Appearance: ${label}. Change appearance`);
  const dark = state.theme === 'dark' || (state.theme === 'auto' && mq.matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#F2F2F7'));
}
mq.addEventListener?.('change', applyTheme);
$('themeBtn').addEventListener('click', () => {
  state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
  applyTheme(); savePrefs();
});

// ---------- Loading ----------
const isPdf = (f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));

async function loadFiles(fileList) {
  const files = [...fileList];
  hideError();
  if (!files.length) return;
  const bad = files.filter((f) => !isPdf(f));
  if (bad.length) {
    return showError('That isn’t a PDF.', `Choose the Inventory Report PDF (got “${bad[0].name}”).`);
  }
  $('busy').hidden = false;
  try {
    const parsed = [];
    for (const f of files) {
      const buf = new Uint8Array(await f.arrayBuffer());
      try {
        const res = await parseInventoryPdf(pdfjs, buf, { isEvalSupported: false });
        if (!res.rows.length) throw new Error('no rows');
        parsed.push({ name: f.name, ...res });
      } catch (err) {
        console.error(err);
        throw new Error(`“${f.name}” doesn’t look like an Inventory Report. Export the report as a PDF from the stock system and try again.`);
      }
    }
    state.files = parsed.map((p) => ({ name: p.name, meta: p.meta }));
    state.rows = parsed.flatMap((p, fi) => p.rows.map((r, i) => ({ ...r, key: `${fi}:${r.article}:${i}`, order: fi * 1e6 + i })));
    state.meta = parsed[0].meta;
    state.excluded = new Set();
    state.query = '';
    $('search').value = '';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError('Couldn’t read that report.', err.message);
  } finally {
    $('busy').hidden = true;
  }
}

function showError(title, msg) {
  const el = $('error');
  el.innerHTML = `<strong>${e(title)}</strong>${e(msg)}`;
  el.hidden = false;
}
function hideError() { $('error').hidden = true; }

for (const id of ['fileInput', 'fileInput2']) {
  $(id).addEventListener('change', (ev) => { loadFiles(ev.target.files); ev.target.value = ''; });
}

// Drag & drop anywhere
let dragDepth = 0;
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); dragDepth++; $('dragOverlay').hidden = false; });
window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dragOverlay').hidden = true; });
window.addEventListener('drop', (ev) => {
  if (!hasFiles(ev)) return;
  ev.preventDefault(); dragDepth = 0; $('dragOverlay').hidden = true;
  loadFiles(ev.dataTransfer.files);
});

// ---------- Derived data ----------
const SORTS = {
  report: (a, b) => a.order - b.order,
  soh: (a, b) => a.soh - b.soh || a.soh / a.mpl - b.soh / b.mpl || a.order - b.order,
  article: (a, b) => Number(a.article) - Number(b.article),
  desc: (a, b) => a.description.localeCompare(b.description),
};
const SORT_LABEL = { report: 'Report order', soh: 'Lowest SOH first', article: 'By article number', desc: 'By description' };

function matched() { return state.rows.filter(needsScan); }

function groupBy(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.category || 'Items';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map].map(([category, items]) => ({ category, items: items.sort(SORTS[state.sort]) }));
}

// ---------- Render ----------
function render() {
  const loaded = state.rows.length > 0;
  $('empty').hidden = loaded;
  $('loaded').hidden = !loaded;
  $('printBtn').hidden = !loaded;
  $('viewBtn').hidden = !loaded;
  if (!loaded) { $('printRoot').innerHTML = ''; return; }

  const all = matched();
  const included = all.filter((r) => !state.excluded.has(r.key));
  const nil = state.rows.filter((r) => r.soh !== null && r.soh <= 0).length;

  // Summary
  const names = state.files.map((f) => f.name);
  $('fileName').textContent = names.length > 1 ? `${names.length} reports loaded` : names[0];
  const m = state.meta;
  $('fileMeta').textContent = [
    m.store && m.store.replace(/\s*\|\s*/, ' '),
    m.printedOn && `printed ${m.printedOn.split(' | ')[0]}`,
    'drop a new PDF to replace',
  ].filter(Boolean).join(' · ');
  $('countScan').textContent = included.length;
  $('countAll').textContent = state.rows.length;
  $('countSkip').textContent = `${nil} left off for no stock · ${state.rows.length - all.length - nil} above MPL`;

  // Controls
  $('sort').value = state.sort;
  setSeg('layoutSeg', state.layout);
  setSeg('sizeSeg', state.size);
  $('viewBtn').textContent = state.view === 'cards' ? 'List View' : 'Card View';
  $('printBtn').disabled = included.length === 0;
  $('printBtn').lastChild.textContent = included.length ? ` Print ${included.length}` : ' Print';

  const excludedCount = all.length - included.length;
  $('hint').innerHTML = excludedCount
    ? `${excludedCount} left off the printout. <button type="button" id="resetEx">Include all</button>`
    : 'Tap a card to leave it off the printout.';
  $('resetEx')?.addEventListener('click', () => { state.excluded.clear(); render(); });

  // Cards
  const q = state.query.trim().toLowerCase();
  const visible = q ? all.filter((r) => r.article.includes(q) || r.description.toLowerCase().includes(q)) : all;
  const sections = $('sections');
  sections.className = state.view === 'list' ? 'list' : '';
  if (!all.length) {
    sections.innerHTML = `<div class="nothing"><strong>Nothing to scan</strong>Every item in this report is either above MPL or has no stock on hand.</div>`;
  } else if (!visible.length) {
    sections.innerHTML = `<div class="nothing"><strong>No matches</strong>No items match “${e(state.query)}”.</div>`;
  } else {
    sections.innerHTML = groupBy(visible).map((g) => `
      <div class="section-head"><h2>${e(titleCase(g.category))}</h2><span>${g.items.length} item${g.items.length === 1 ? '' : 's'} · ${SORT_LABEL[state.sort]}</span></div>
      <div class="cards">${g.items.map(card).join('')}</div>`).join('');
  }

  // Print sheets (kept in sync so Cmd/Ctrl+P always works)
  $('printRoot').innerHTML = included.length
    ? renderPrint({ groups: groupBy(included), layout: state.layout, size: state.size, meta: state.meta, site: SITE })
    : '';
}

function card(r) {
  const on = !state.excluded.has(r.key);
  return `<button type="button" class="card" data-key="${e(r.key)}" aria-pressed="${on}" aria-label="${e(r.article)} ${e(r.description)}, SOH ${e(r.soh)}, MPL ${e(r.mpl)}. ${on ? 'Included' : 'Left off'}">
    <span class="qr-tile">${qrSvg(r.article)}</span>
    <span class="card-body">
      <span class="card-article">${e(r.article)}</span>
      <span class="card-desc">${e(r.description)}</span>
      <span class="pills"><span class="pill pill-soh">SOH ${e(r.soh)}</span><span class="pill">MPL ${e(r.mpl)}</span>${on ? '' : '<span class="pill pill-off">Left off</span>'}</span>
    </span>
  </button>`;
}

function setSeg(id, v) {
  $(id).querySelectorAll('button').forEach((b) => {
    const on = b.dataset.v === v;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

// ---------- Events ----------
$('sections').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.card');
  if (!btn) return;
  const k = btn.dataset.key;
  state.excluded.has(k) ? state.excluded.delete(k) : state.excluded.add(k);
  render();
  document.querySelector(`.card[data-key="${CSS.escape(k)}"]`)?.focus();
});

function wireSeg(id, key) {
  const seg = $(id);
  seg.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    state[key] = b.dataset.v; savePrefs(); render();
  });
  seg.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const btns = [...seg.querySelectorAll('button')];
    const i = btns.findIndex((b) => b.dataset.v === state[key]);
    const n = btns[(i + (ev.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    state[key] = n.dataset.v; savePrefs(); render(); n.focus();
    ev.preventDefault();
  });
}
wireSeg('layoutSeg', 'layout');
wireSeg('sizeSeg', 'size');

$('sort').addEventListener('change', (ev) => { state.sort = ev.target.value; savePrefs(); render(); });
$('search').addEventListener('input', (ev) => { state.query = ev.target.value; render(); });
$('viewBtn').addEventListener('click', () => { state.view = state.view === 'cards' ? 'list' : 'cards'; savePrefs(); render(); });
$('printBtn').addEventListener('click', () => window.print());

applyTheme();
render();
