import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseInventoryPdf, needsScan } from '../src/parser.js';

const data = () => new Uint8Array(readFileSync(new URL('./fixtures/globes-inventory-report.pdf', import.meta.url)));

describe('parseInventoryPdf', () => {
  it('parses every article in the sample report', async () => {
    const { rows, meta } = await parseInventoryPdf(pdfjs, data(), { verbosity: 0 });
    expect(rows).toHaveLength(115);
    expect(meta.expected).toBe(115);
    expect(meta.store).toBe('2173 | Toowoomba Drayton');
    expect(meta.department).toBe('GENERAL MERCHANDISE');
    expect(meta.printedOn).toBe('25/11/2026 | 11:59 AM');
    for (const r of rows) {
      expect(r.soh).not.toBeNull();
      expect(r.mpl).not.toBeNull();
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it('joins wrapped descriptions', async () => {
    const { rows } = await parseInventoryPdf(pdfjs, data(), { verbosity: 0 });
    const r = rows.find((x) => x.article === '130918');
    expect(r.description).toBe('Mira Genio GLS BC 9W800LM RGB CCT WWCWDL');
    expect(r.soh).toBe(8);
    expect(r.mpl).toBe(1);
    expect(r.category).toBe('GLOBES');
  });

  it('selects exactly the items with 0 < SOH <= MPL', async () => {
    const { rows } = await parseInventoryPdf(pdfjs, data(), { verbosity: 0 });
    const picked = rows.filter(needsScan).map((r) => `${r.article}:${r.soh}/${r.mpl}`);
    expect(picked).toEqual([
      '30587:2/2', '439128:2/2', '871612:1/1', '6063395:1/1', '192073:1/1',
      '197353:1/1', '439127:1/2', '551490:1/2', '671659:1/1',
    ]);
  });

  it('never selects zero or negative stock', () => {
    expect(needsScan({ soh: 0, mpl: 2 })).toBe(false);
    expect(needsScan({ soh: -1, mpl: 2 })).toBe(false);
    expect(needsScan({ soh: 3, mpl: 2 })).toBe(false);
    expect(needsScan({ soh: 2, mpl: 2 })).toBe(true);
  });
});
