import qrcode from 'qrcode-generator';

const cache = new Map();

/**
 * SVG for a QR code containing exactly `text` (the article number).
 * Error correction M, 4-module quiet zone, black on white, scalable.
 */
export function qrSvg(text, { label = text, className = '' } = {}) {
  let path = cache.get(text);
  let n;
  if (!path) {
    const q = qrcode(0, 'M');
    q.addData(String(text), 'Byte');
    q.make();
    n = q.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (q.isDark(y, x)) {
          const s = x;
          while (x < n && q.isDark(y, x)) x++;
          d += `M${s} ${y}h${x - s}v1h-${x - s}z`;
        } else x++;
      }
    }
    path = { d, n };
    cache.set(text, path);
  }
  n = path.n;
  const v = n + 8;
  return `<svg class="${className}" viewBox="-4 -4 ${v} ${v}" role="img" aria-label="QR code ${escapeHtml(label)}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${v}" height="${v}" fill="#fff"/><path d="${path.d}" fill="#000"/></svg>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
