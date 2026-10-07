/**
 * Measures the generated logo the same way the original was measured, so the
 * reconstruction can be checked numerically instead of by eye.
 *
 * Run: node scripts/verify-logo.cjs
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SRC =
  'C:/Users/jcuad/.minimax/v2/assets/2026/10/07/14-12-08-530-asset_20261007-141208-530_ec0f1a08f009_7205642b-logo.jpg';
const BRAND = path.join(__dirname, '..', 'public', 'brand');

/**
 * Runs identical ink-mask analysis over either the source bitmap or the
 * rendered vector, so the two component tables are directly comparable.
 */
async function measure(page, html) {
  await page.setContent('<body style="margin:0"></body>');
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, W, H);

    const ink = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (g > r + 10 && g > b + 10 && sat > 0.3) ink[p] = 1;
    }

    let minX = W, maxX = -1, minY = H, maxY = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (ink[y * W + x]) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }

    const label = new Int32Array(W * H).fill(-1);
    const comps = [];
    const stack = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!ink[y * W + x] || label[y * W + x] !== -1) continue;
        const id = comps.length;
        let x0 = x, x1 = x, y0 = y, y1 = y;
        stack.length = 0; stack.push(y * W + x); label[y * W + x] = id;
        while (stack.length) {
          const p = stack.pop();
          const py = (p / W) | 0, px = p - py * W;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
          if (px > 0 && ink[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
          if (px < W - 1 && ink[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
          if (py > 0 && ink[p - W] && label[p - W] === -1) { label[p - W] = id; stack.push(p - W); }
          if (py < H - 1 && ink[p + W] && label[p + W] === -1) { label[p + W] = id; stack.push(p + W); }
        }
        comps.push({ x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
    }
    comps.sort((a, b) => a.x0 - b.x0);

    return {
      box: { w: maxX - minX + 1, h: maxY - minY + 1 },
      comps: comps.filter((k) => k.w * k.h > 400 && k.w < W * 0.6).map((k) => ({ ...k })),
    };
  }, html);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Original, cropped to its ink box so coordinates match the SVG's own space.
  const jpg = `data:image/jpeg;base64,${fs.readFileSync(SRC).toString('base64')}`;

  await page.setContent('<body style="margin:0"></body>');
  await page.evaluate(
    ({ src, cx, cy, w, h }) =>
      new Promise((done) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.id = 'crop';
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, cx, cy, w, h, 0, 0, w, h);
          document.body.appendChild(cv);
          done();
        };
        img.src = src;
      }),
    { src: jpg, cx: 192, cy: 705, w: 1536, h: 509 }
  );
  const origBox = await page.evaluate(
    () =>
      new Promise((done) => {
        const cv = document.getElementById('crop');
        // Re-measure inside the cropped canvas via a data URI round trip.
        done(cv.toDataURL('image/png'));
      })
  );

  const svg = fs.readFileSync(path.join(BRAND, 'liko-logo.svg'), 'utf8');
  // NB: never strip `width="..."` with a loose regex here, it also matches
  // inside `stroke-width="..."` and silently thins the first stroked path.
  await page.setContent(`<body style="margin:0"><div id="h">${svg}</div></body>`);
  const vecBox = await page.evaluate(
    () =>
      new Promise((done) => {
        const el = document.querySelector('#h svg');
        const s = getComputedStyle(el);
        const svgText = new XMLSerializer().serializeToString(el)
          // An SVG with only a viewBox has no intrinsic size, so the <img>
          // fallback rasterises it at 300x150 and letterboxes. Pin the size.
          .replace(/<svg /, '<svg width="1536" height="509" ');
        const cv = document.createElement('canvas');
        cv.id = 'vec';
        cv.width = 1536; cv.height = 509;
        const g = cv.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 1536, 509);
        const im = new Image();
        im.onload = () => {
          g.drawImage(im, 0, 0, 1536, 509);
          document.body.appendChild(cv);
          void s;
          done(cv.toDataURL('image/png'));
        };
        im.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
      })
  );

  const a = await measure(page, origBox);
  const b = await measure(page, vecBox);

  // Keep the rasters when asked, so a regression can be inspected rather than
  // guessed at. Off by default so verification leaves no files behind.
  if (process.argv.includes('--dump')) {
    const dump = (name, uri) =>
      fs.writeFileSync(
        path.join(__dirname, '..', name),
        Buffer.from(uri.split(',')[1], 'base64')
      );
    dump('.logo-verify-orig.png', origBox);
    dump('.logo-verify-raster.png', vecBox);
  }

  const fmt = (k) => `x ${String(k.x0).padStart(4)}..${String(k.x1).padStart(4)} y ${String(k.y0).padStart(3)}..${String(k.y1).padStart(3)}  ${String(k.w).padStart(4)}x${String(k.h).padStart(3)}`;
  const cmp = (v) => String(v >= 0 ? '+' + v : v);

  console.log('ink box   original', a.box.w + 'x' + a.box.h, '  rebuild', b.box.w + 'x' + b.box.h);
  console.log('components', a.comps.length, 'vs', b.comps.length);
  console.log('');
  const n = Math.max(a.comps.length, b.comps.length);
  for (let i = 0; i < n; i++) {
    const A = a.comps[i], B = b.comps[i];
    console.log(`  [${i}] original  ${A ? fmt(A) : '-'}`);
    console.log(`      rebuild   ${B ? fmt(B) : '-'}`);
    if (A && B)
      console.log(
        `      delta     dx0 ${cmp(B.x0 - A.x0)}  dx1 ${cmp(B.x1 - A.x1)}  dy0 ${cmp(B.y0 - A.y0)}  dy1 ${cmp(B.y1 - A.y1)}`
      );
    console.log('');
  }

  await browser.close();
})();