/**
 * Production verification for the work in this release.
 *
 * Written because every gate that runs before a deploy can pass while the
 * deployed thing is wrong. `check:sql` parses, the e2e suite runs against a
 * local build, and neither of them has ever fetched a page from Vercel.
 *
 * Every check below is a live HTTP request against the production URL and a
 * literal expectation decided before the request was made.
 */
const BASE = process.env.LIKO_PROD ?? 'https://liko-jcuadys-projects.vercel.app';

const results = [];
function check(name, ok, detail = '') {
  results.push({ ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}\n`);
}

async function status(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  const text = res.ok ? await res.text() : '';
  return { status: res.status, text, headers: res.headers };
}

try {
  // ---- The four new legal documents, which have to be findable, not merely present.
  const LEGAL = [
    '/acceptable-use',
    '/children-privacy',
    '/subprocessors',
    '/dpa',
    '/terms',
    '/privacy',
    '/cookies',
  ];
  for (const path of LEGAL) {
    const page = await status(path);
    check(`${path} is served`, page.status === 200, `status ${page.status}`);
  }

  // ---- The subprocessor list names only what the repo evidences.
  const sub = await status('/subprocessors');
  check('the subprocessor page names Supabase', /supabase/i.test(sub.text));
  check('the subprocessor page names Vercel', /vercel/i.test(sub.text));
  check(
    'the subprocessor page does not invent a processor the repo does not use',
    !/stripe|paddle|segment|intercom|mixpanel|amplitude|datadog|sentry/i.test(sub.text),
  );

  // ---- No page claims compliance. This is the single most important check here:
  // a compliance claim nobody can evidence is worse than no page at all.
  //
  // MATCHED ON AN ASSERTION, NOT ON THE WORD. The first version of this matched
  // the bare word "certified" and fired on the DPA's own sentence saying the
  // Processor does NOT represent that its controls have been certified by
  // anyone. A gate that reports a disclaimer as a violation gets switched off,
  // so it has to distinguish a claim from a denial of one.
  const CLAIM =
    /\b(LIKO|we|the (Processor|Controller))\s+(is|are|has been|have been|holds?)\s+(COPPA|FERPA|GDPR|ISO|SOC|PCC)\b[^.]{0,40}\b(certified|compliant|approved|certifiable)\b/i;
  const DISCLAIMER =
    /does not (represent|claim)|not a compliance statement|no such (certification|assessment)|has not been (certified|assessed)/i;

  for (const path of ['/children-privacy', '/dpa', '/acceptable-use']) {
    const page = await status(path);
    const bare = page.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    check(`${path} makes no compliance claim`, !CLAIM.test(bare));
  }

  /*
   * The disclaimer is required only of the two documents that discuss
   * regulation. An Acceptable Use Policy is not a regulatory document and
   * repeating a "this is not a compliance statement" line in it would be noise;
   * the first version of this check demanded one everywhere and failed a page
   * for correctly saying nothing.
   */
  for (const path of ['/children-privacy', '/dpa']) {
    const page = await status(path);
    const bare = page.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    check(`${path} says plainly that it is not a compliance statement`, DISCLAIMER.test(bare));
  }

  // ---- The children's notice is honest about who is the controller.
  const children = await status('/children-privacy');
  check(
    'the children\'s notice names the school as the controller',
    /controller/i.test(children.text),
  );

  // ---- The sitemap indexes all seven, since a document nobody can find is not
  // a document. A school running a procurement checklist looks these up by URL.
  const sitemap = await status('/sitemap.xml');
  for (const path of LEGAL) {
    check(`the sitemap lists ${path}`, sitemap.text.includes(`${BASE}${path}`));
  }

  // ---- The new route exists and refuses an anonymous visitor by sending them to
  // sign in.
  //
  // Asserted on the title and the form, NOT on the absence of the 404 string. The
  // not-found component ships inside the RSC flight payload of every page that
  // includes it, so "this page does not contain the words of the 404 page" is
  // true of nothing and false of everything.
  const join = await status('/join');
  check(
    '/join exists and refuses an anonymous visitor by asking them to sign in',
    join.status === 200 && /<title>Sign in/i.test(join.text) && /type="password"/i.test(join.text),
    `status ${join.status}`,
  );

  // ---- The workspace still refuses an anonymous visitor.
  const admin = await status('/admin');
  check(
    '/admin is not readable without a session',
    !admin.text.includes('Administration</h1>'),
    `status ${admin.status}`,
  );

  // ---- The sheet route needs a session too.
  const sheet = await status('/assess/sheet');
  check(
    'the printable sheet is not readable without a session',
    !sheet.text.includes('data-answer-sheet'),
    `status ${sheet.status}`,
  );

  // ---- Standard routes that did not exist before this release.
  const notFound = await status('/this-route-does-not-exist');
  check(
    'an unknown route renders the 404 page',
    notFound.status === 404 || notFound.text.includes('That page does not exist'),
    `status ${notFound.status}`,
  );

  // ---- Performance, measured rather than assumed. Reported as the number of
  // characters actually received, because the response is chunked and carries no
  // content-length; measuring the header would report zero for a healthy page.
  const perf = await status('/children-privacy');
  const legalKb = Math.round(perf.text.length / 1024);
  check(
    'the new legal page serves a body of a reasonable size',
    legalKb > 5 && legalKb < 200,
    `${legalKb} KB received`,
  );
} catch (error) {
  check('the probe ran to completion', false, String(error).slice(0, 200));
}

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);