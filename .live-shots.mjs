import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://liko-jcuadys-projects.vercel.app';
const browser = await chromium.launch();

const SECTIONS = [
  ['hero', null],
  ['levels', '.teacher-levels'],
  ['features', '#features'],
  ['story', '#story'],
  ['mobile', '#mobile'],
  ['pricing', '#pricing'],
  ['faq', '#faq'],
  ['cta', '.bottom-cta'],
  ['footer', 'footer'],
];

for (const [label, width, height] of [
  ['desktop', 1440, 950],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } });

  // Answer the cookie banner so it does not sit over the bottom of every shot.
  // `networkidle` never settles here: the service worker and the push
  // subscription keep the network busy, so it times out rather than reporting.
  // Wait for load, then for the fonts, then a beat for hydration.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('load').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1500);
  const keep = page.getByRole('button', { name: /keep my choice/i });
  if (await keep.count()) {
    await keep.first().click();
    await page.waitForTimeout(400);
  }

  for (const [name, sel] of SECTIONS) {
    if (sel) {
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70 });
      }, sel);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(350);
    await page.screenshot({ path: `.live-${label}-${name}.png` });
  }

  console.log(`${label}: ${SECTIONS.length} sections captured`);
  await page.close();
}

await browser.close();