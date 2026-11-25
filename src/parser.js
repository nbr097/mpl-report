// Parses the "Inventory Report" PDF (JasperReports export) into article rows.
// Works off text positions, so wrapped descriptions and blank columns are handled.

const NUM = /^-?\d+(\.\d+)?$/;
const FLAGS = new Set(['PI', 'D', 'P', 'PB']);

export async function parseInventoryPdf(pdfjs, data, opts = {}) {
  const doc = await pdfjs.getDocument({ data, ...opts }).promise;
  const rows = [];
  const meta = { store: '', printedOn: '', department: '', pages: doc.numPages, expected: null };
  let category = '';

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        return { s: it.str.trim(), x: t[4], y: t[5], w: it.width, cx: t[4] + it.width / 2 };
      });

    // Metadata
    for (const it of items) {
      if (!meta.store && /^\d+\s*\|\s*\S/.test(it.s)) meta.store = it.s;
      if (!meta.printedOn && /^Printed on:/.test(it.s)) {
        const rest = it.s.replace('Printed on:', '').trim();
        const next = items.find((o) => o !== it && Math.abs(o.y - it.y) < 2 && o.x > it.x && /\d{2}\/\d{2}\/\d{4}/.test(o.s));
        meta.printedOn = rest || (next ? next.s : '');
      }
      const lm = it.s.match(/List of articles \((\d+)\)/);
      if (lm && meta.expected === null) meta.expected = Number(lm[1]);
      const dm = it.s.match(/Department:\s*([^|]+)/);
      if (dm && !meta.department) meta.department = dm[1].trim();
    }

    // Header row
    const hArticle = items.find((it) => it.s === 'Article');
    if (!hArticle) continue;
    const hy = hArticle.y;
    const headers = items.filter((it) => Math.abs(it.y - hy) < 2);
    const h = (name) => headers.find((it) => it.s.toLowerCase() === name.toLowerCase());
    const hDesc = h('Description');
    const hUom = h('UOM');
    const hSoh = h('SOH');
    const hMpl = h('MPL');
    if (!hDesc || !hSoh || !hMpl) throw new Error(`Page ${p}: couldn't find SOH/MPL/Description headers.`);

    const valueCols = headers.filter((it) => it !== hArticle && it !== hDesc);
    const body = items.filter((it) => it.y > hy + 4 && !/^Legend:|^Printed on:|^End of Report/.test(it.s));

    // Category headings + article anchors (left-aligned in the Article column)
    const inArticleCol = body.filter((it) => Math.abs(it.x - hArticle.x) < 12);
    const anchors = [];
    for (const it of inArticleCol.sort((a, b) => a.y - b.y)) {
      if (/^\d{3,}$/.test(it.s)) anchors.push({ article: it.s, y: it.y, category, desc: [] , vals: {}, flag: '' });
      else if (/^[A-Z0-9 &/\-]+$/.test(it.s)) category = it.s;
    }
    if (!anchors.length) continue;

    const descLeft = hDesc.x - 6;
    const descRight = (hUom ? hUom.x : hSoh.x) - 4;

    for (const it of body) {
      if (inArticleCol.includes(it)) continue;
      // nearest anchor by y
      let best = null, bd = Infinity;
      for (const a of anchors) { const d = Math.abs(a.y - it.y); if (d < bd) { bd = d; best = a; } }
      if (!best || bd > 16) continue;

      if (it.x >= descLeft && it.x < descRight) {
        best.desc.push(it);
      } else if (it.x < descLeft && FLAGS.has(it.s) && bd < 2) {
        best.flag = it.s;
      } else if (bd < 2) {
        let col = null, cd = Infinity;
        for (const hc of valueCols) { const d = Math.abs(hc.cx - it.cx); if (d < cd) { cd = d; col = hc.s; } }
        if (col) best.vals[col] = it.s;
      }
    }

    for (const a of anchors) {
      const soh = parseFloat(a.vals['SOH']);
      const mpl = parseFloat(a.vals['MPL']);
      rows.push({
        article: a.article,
        flag: a.flag,
        category: a.category,
        description: a.desc.sort((m, n) => m.y - n.y || m.x - n.x).map((d) => d.s).join(' ').replace(/\s+/g, ' '),
        soh: Number.isFinite(soh) ? soh : null,
        mpl: Number.isFinite(mpl) ? mpl : null,
        om: a.vals['OM'] ?? '',
        capacity: a.vals['Capcity'] ?? a.vals['Capacity'] ?? '',
        lastSold: a.vals['Last Sold'] ?? '',
        page: p,
      });
    }
  }
  return { rows, meta };
}

/** Items to scan: some stock on hand, at or below MPL. */
export function needsScan(r) {
  return r.soh !== null && r.mpl !== null && r.soh > 0 && r.soh <= r.mpl;
}

export function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
