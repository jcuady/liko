#!/usr/bin/env node
/**
 * Behaviour checks for the marketing page.
 *
 * These are the things a screenshot cannot show but a visitor will feel:
 *
 *   1. Anchor navigation must not park a heading underneath the sticky nav.
 *   2. `prefers-reduced-motion: reduce` must remove the reveals and the GSAP
 *      scroll narratives rather than merely shortening them.
 *   3. With scripting blocked, nothing may be left stuck at `opacity: 0`.
 *      A PWA has to render its own content with no network and no JS runtime.
 *
 * Usage: node scripts/behaviour-check.cjs [url]
 */

const { chromium } = require('@playwright/test');

const URL = process.argv[2] ?? 'http://localhost:3000';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS  ' : 'FAIL  '} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main() {
  const browser = await chromium.launch();

  // --- 1. Anchor navigation clears the sticky nav ---------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL, { waitUntil: 'networkidle' });

    const targets = await page.$$eval('nav a[href^="#"]', (links) =>
      links.map((a) => a.getAttribute('href')).filter(Boolean),
    );

    for (const href of targets) {
      await page.click(`nav a[href="${href}"]`);
      // Smooth scrolling is on, so let the scroll settle before measuring.
      await page.waitForTimeout(900);

      const result = await page.evaluate((hash) => {
        const section = document.querySelector(hash);
        if (!section) return { missing: true };
        const heading = section.querySelector('h1, h2');
        if (!heading) return { noHeading: true };

        const nav = document.querySelector('header') ?? document.querySelector('nav');
        const navBox = nav?.getBoundingClientRect();
        const headingBox = heading.getBoundingClientRect();

        return {
          headingTop: Math.round(headingBox.top),
          navBottom: navBox ? Math.round(navBox.bottom) : 0,
          // A heading is only hidden if its top edge is above the nav's bottom
          // edge. Anything else, including sitting well below it, is fine.
          covered: headingBox.top < (navBox?.bottom ?? 0) - 1,
          text: heading.textContent.trim().slice(0, 40),
        };
      }, href);

      if (result.missing) {
        check(`anchor ${href} target exists`, false, 'no element matches');
      } else if (result.noHeading) {
        check(`anchor ${href} has a heading`, false);
      } else {
        check(
          `anchor ${href} heading clears the nav`,
          !result.covered,
          `"${result.text}" top=${result.headingTop} navBottom=${result.navBottom}`,
        );
      }
    }
    await page.close();
  }

  // --- 2. Reduced motion collapses everything ------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => {
      const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
      const hidden = reveals.filter((el) => Number(getComputedStyle(el).opacity) < 0.9);
      const marquee = document.querySelector('.liko-marquee-track');
      return {
        revealCount: reveals.length,
        hiddenCount: hidden.length,
        marqueeAnimating: marquee
          ? getComputedStyle(marquee).animationName !== 'none'
          : false,
      };
    });

    check(
      'reduced motion: every reveal is visible',
      state.hiddenCount === 0,
      `${state.hiddenCount} of ${state.revealCount} still hidden`,
    );
    check(
      'reduced motion: marquee is not animating',
      !state.marqueeAnimating,
    );

    // The page must still be scrollable to the end with no pin runway.
    const scrollable = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              Math.abs(
                window.scrollY + window.innerHeight - document.body.scrollHeight,
              ) < 4,
            ),
          400,
        ),
      );
    });
    check('reduced motion: page reaches the true bottom', scrollable);
    await context.close();
  }

  // --- 3. No-JS fallback ---------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'load' });

    const state = await page.evaluate(() => {
      const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
      const hidden = reveals.filter((el) => Number(getComputedStyle(el).opacity) < 0.9);
      const heading = document.querySelector('h1');
      return {
        revealCount: reveals.length,
        hiddenCount: hidden.length,
        htmlClass: document.documentElement.className,
        headline: heading?.textContent.trim().slice(0, 40) ?? null,
      };
    });

    check(
      'no-JS: root keeps the no-js class',
      state.htmlClass.includes('no-js'),
      `class="${state.htmlClass}"`,
    );
    check(
      'no-JS: nothing is left hidden',
      state.hiddenCount === 0,
      `${state.hiddenCount} of ${state.revealCount} hidden`,
    );
    check('no-JS: headline still renders', Boolean(state.headline), state.headline ?? '');
    await context.close();
  }

  await browser.close();

  console.log('');
  if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('all behaviour checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});