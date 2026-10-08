/**
 * Responsive audit for the landing page.
 *
 * Loads the page at every breakpoint the e2e suite cares about, records any
 * horizontal overflow and the elements responsible, and writes a full-page
 * screenshot per width for eyeballing.
 *
 * Run: node scripts/responsive-check.cjs [url]
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { defaultUrl, describeTarget } = require('./lib/target.cjs');

const URL = process.argv[2] || defaultUrl();
const OUT = path.join(__dirname, '..', '.responsive');

const WIDTHS = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

/** Elements that are allowed to exceed the viewport width. */
const ALLOWED = [
  '.pan-track',
  '.pan-bleed',
  '.bloom',
  '.liko-marquee-track',
  '[aria-hidden="true"]',
];

/** Sections captured individually at the two widths that matter most. */
const SECTIONS = ['modules', 'roles'];
const SHOT_WIDTHS = ['375', '1440'];

(async () => {
  /*
   * Refuse to grade anything until the server is known to be this checkout.
   * This script used to default to port 3000, which on this machine is an
   * unrelated application, so it has been writing screenshots of somebody else's
   * landing page and reporting their breakpoints as LIKO's. See
   * scripts/lib/target.cjs.
   */
  const target = await describeTarget(URL);
  if (!target.ok) {
    console.log(`FAIL  wrong server  ${target.reason}`);
    process.exit(1);
  }
  console.log(`PASS  serving this checkout  build ${target.buildId} at ${URL}`);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;

  for (const vp of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    await page.goto(URL, { waitUntil: 'networkidle' });

    // Scroll the whole page once so every scroll-reveal has fired before we
    // capture, otherwise the shot catches blocks still sitting at opacity 0.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.6;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);

    const report = await page.evaluate((allowed) => {
      const doc = document.documentElement;
      const vw = doc.clientWidth;
      const offenders = [];

      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= vw + 1 && r.left >= -1) continue;

        // Skip anything inside an allowed container, and anything purely
        // decorative or aria-hidden.
        const skip = allowed.some((sel) => el.closest(sel));
        if (skip) continue;
        if (el.closest('[aria-hidden="true"]')) continue;

        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;

        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }

      return {
        vw,
        scrollWidth: doc.scrollWidth,
        overflow: doc.scrollWidth > vw + 1,
        offenders: offenders.slice(0, 8),
      };
    }, ALLOWED);

    await page.screenshot({
      path: path.join(OUT, `landing-${vp.name}.png`),
      fullPage: true,
    });

    if (SHOT_WIDTHS.includes(vp.name)) {
      for (const id of SECTIONS) {
        const el = page.locator(`#${id}`);
        if ((await el.count()) === 0) continue;
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);
        await el.screenshot({ path: path.join(OUT, `${id}-${vp.name}.png`) });
      }
    }

    await page.close();

    const ok = !report.overflow && report.offenders.length === 0;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${vp.name.padStart(4)}px  ` +
        `scrollWidth ${report.scrollWidth} vs viewport ${report.vw}`
    );
    for (const o of report.offenders) {
      console.log(`        ${o.tag}.${o.cls}  ${o.left}..${o.right}`);
    }
  }

  console.log(`\nscreenshots in ${OUT}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();