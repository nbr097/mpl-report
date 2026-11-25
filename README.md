# MPL Scan

**Live:** https://mpl.nicholasbrown.me

Upload an *Inventory Report* PDF and MPL Scan builds a printable A4 list of QR codes. It includes every article whose **stock on hand is at or below MPL**. Items with 0 SOH are left off. Each QR code contains **only the article number**, so the Zebra RF units scan it straight in.

Everything runs in the browser. The PDF never leaves the device.

## Features
- Drag and drop a PDF anywhere on the page, or choose one. You can select several reports at once.
- Light and dark mode follow the system setting. You can override it with the Auto / Light / Dark button.
- Tap a card to leave that item off the printout.
- Search, and sort by report order, lowest SOH, article or description.
- Three print layouts (QR grid, QR list with "Scanned" tick boxes, cut-out labels), each with S/M/L QR sizes.
- Each category starts on a new page. Every page has a header, the item count and "Page X of Y".
- Your choices are saved in localStorage.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser tests against test/fixtures/globes-inventory-report.pdf
npm run build    # outputs dist/
```

## Deploy to Cloudflare
**Workers (recommended, uses `wrangler.jsonc`)**
1. Workers & Pages → your Worker → Settings → Build → Connect to the GitHub repo.
2. Build command: leave empty. Deploy command: `npx wrangler deploy`. Root directory: `/`.
3. Settings → Domains & Routes → Add → Custom domain → `mpl.nicholasbrown.me`.

### Or Cloudflare Pages
**Option A: Git integration (redeploys automatically on push)**
1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → choose the repo.
3. Framework preset: *None*. Build command: `npm run build`. Output directory: `dist`.
4. Once it has deployed: Custom domains → Set up a custom domain → `mpl.nicholasbrown.me`.

**Option B: Direct upload (no Git)**
1. Run `npm run build`, or use the prebuilt `dist` zip.
2. Workers & Pages → Create → Pages → Upload assets → drop in the `dist` folder or zip.
3. Add the custom domain as in step 4 above.

**Option C: Wrangler**
```bash
npx wrangler pages deploy dist --project-name mpl-scan
```

`public/_headers` sets a strict Content-Security-Policy and long-term caching for hashed assets.

## How parsing works
The report is a JasperReports export with rotated pages. Descriptions can wrap onto two lines, and many columns are blank. Because of that, `src/parser.js` reads text **positions** from pdf.js rather than plain text:
1. Find the header row (`Article`, `Description`, `SOH`, `MPL`, …) and the centre point of each heading.
2. Treat numeric items left-aligned under **Article** as row anchors. Uppercase text in that column is a category heading (e.g. `GLOBES`).
3. Text between the Description and UOM headings is joined into the description, including wrapped lines above and below the row.
4. Numbers on the row's line go to the column whose heading centre is nearest.

The tests check the sample report parses to 115 rows, with exactly 9 items to scan.
