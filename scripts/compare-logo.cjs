/**
 * Renders the reconstructed logo against the supplied original so the two can
 * be compared directly. Row one is the original, row two is the vector rebuild,
 * row three overlays them so any drift shows up as a doubled edge.
 *
 * Run: node scripts/compare-logo.cjs
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SRC =
  'C:/Users/jcuad/.minimax/v2/assets/2026/10/07/14-12-08-530-asset_20261007-141208-530_ec0f1a08f009_7205642b-logo.jpg';
const OUT = path.join(__dirname, '..', '.logo-compare.png');
const BRAND = path.join(__dirname, '..', 'public', 'brand');

const W = 1536;
const H = 509;
// The original's ink box sits at (192, 705) in the 1920-square source.
const CROP_X = 192;
const CROP_Y = 705;

(async () => {
  const svg = fs.readFileSync(path.join(BRAND, 'liko-logo.svg'), 'utf8')
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  const jpg = `data:image/jpeg;base64,${fs.readFileSync(SRC).toString('base64')}`;

  // The original, positioned so only the ink box is visible.
  const original = `<div class="crop"><img src="${jpg}" alt="" /></div>`;
  const vector = `<svg class="vec" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W + 40, height: 900 } });

  await page.setContent(`
    <style>
      body { margin:0; background:#fff; font:11px/1 ui-monospace,monospace; color:#fff; }
      .wrap { padding:16px; display:grid; gap:18px; }
      .row { position:relative; width:${W}px; height:${H}px; overflow:hidden; background:#fff; }
      .crop { position:absolute; inset:0; overflow:hidden; }
      .crop img { position:absolute; width:1920px; height:1920px;
                  left:${-CROP_X}px; top:${-CROP_Y}px; }
      .vec { position:absolute; inset:0; width:${W}px; height:${H}px; display:block; }
      .tag { position:absolute; z-index:9; top:0; left:0; background:#111; padding:3px 7px; }
    </style>
    <div class="wrap">
      <div class="row">${original}<div class="tag">ORIGINAL</div></div>
      <div class="row">${vector}<div class="tag">REBUILD</div></div>
      <div class="row">
        <div class="crop" style="filter:grayscale(1) contrast(1.7)">${original}</div>
        <div style="position:absolute;inset:0;mix-blend-mode:multiply;opacity:.9">${vector}</div>
        <div class="tag">OVERLAY</div>
      </div>
    </div>`);

  await page.waitForLoadState('networkidle');
  await page.locator('.row img').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('wrote', OUT);
  await browser.close();
})();