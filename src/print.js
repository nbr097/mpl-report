import { qrSvg, escapeHtml as e } from './qr.js';
import { titleCase } from './parser.js';

// QR size (mm), columns and items per A4 page for each layout + size.
export const LAYOUTS = {
  grid:   { name: 'QR grid', S: { qr: 24, cols: 4, per: 16 }, M: { qr: 34, cols: 3, per: 9 }, L: { qr: 46, cols: 2, per: 6 } },
  list:   { name: 'QR list', S: { qr: 14, per: 11 }, M: { qr: 19, per: 9 }, L: { qr: 25, per: 7 } },
  labels: { name: 'Labels',  S: { qr: 24, per: 12 }, M: { qr: 32, per: 10 }, L: { qr: 40, per: 8 } },
};

const pills = (r) =>
  `<span class="p-pills"><span class="p-pill p-pill-soh">SOH ${e(r.soh)}</span><span class="p-pill">MPL ${e(r.mpl)}</span></span>`;

function item(layout, r) {
  const qr = qrSvg(r.article, { className: 'sh-qr' });
  if (layout === 'grid') {
    return `<div class="p-item">${qr}<span class="p-article">${e(r.article)}</span><span class="p-desc">${e(r.description)}</span>${pills(r)}</div>`;
  }
  if (layout === 'list') {
    return `<div class="p-item">${qr}<span class="p-text"><span class="p-article">${e(r.article)}</span><span class="p-desc">${e(r.description)}</span></span>${pills(r)}<span class="p-tick">Scanned <i></i></span></div>`;
  }
  return `<div class="p-item">${qr}<span class="p-text"><span class="p-article">${e(r.article)}</span><span class="p-desc">${e(r.description)}</span>${pills(r)}</span></div>`;
}

/**
 * Builds the printable A4 sheets. Each category starts on a new page.
 * groups: [{ category, items: [...] }]
 */
export function renderPrint({ groups, layout, size, meta, site }) {
  const spec = LAYOUTS[layout][size];
  const pages = [];
  for (const g of groups) {
    for (let i = 0; i < g.items.length; i += spec.per) {
      pages.push({ g, items: g.items.slice(i, i + spec.per) });
    }
  }
  const total = pages.length;
  const metaLine = [meta.store?.replace(/\s*\|\s*/, ' '), meta.printedOn && `report printed ${meta.printedOn.replace(' | ', ' ')}`]
    .filter(Boolean).map(e).join(' · ');

  return pages.map((p, idx) => `
    <section class="sheet lay-${layout}" style="--qr:${spec.qr}mm;--cols:${spec.cols || 1}">
      <header class="sh-head">
        <div class="sh-titles">
          <span class="sh-kicker">MPL Scan · ${e(LAYOUTS[layout].name)}</span>
          <h1 class="sh-title">${e(titleCase(p.g.category || 'Items'))}</h1>
          <span class="sh-meta">${metaLine}</span>
        </div>
        <div class="sh-count"><b>${p.g.items.length}</b><span>to scan<br><small>SOH ≤ MPL</small></span></div>
      </header>
      ${layout === 'labels' ? '<div class="sh-note">Cut along the dashed lines</div>' : ''}
      <div class="sh-body">${p.items.map((r) => item(layout, r)).join('')}</div>
      <footer class="sh-foot"><span>${e(site)}</span><span>Page ${idx + 1} of ${total}</span></footer>
    </section>`).join('');
}
