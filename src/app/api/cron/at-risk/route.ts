import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import { runAtRiskSweep } from '@/lib/push/at-risk';

/**
 * The at-risk sweep endpoint.
 *
 * SCHEDULE. `vercel.json` declares this path as a daily cron at 07:00 UTC. Vercel
 * invokes a cron with GET, and Vercel sends the value of the `CRON_SECRET`
 * environment variable as `Authorization: Bearer <secret>` when that variable is
 * set. The Hobby plan offers no choice of verb, which is why GET and POST share
 * one implementation rather than GET being a redirect: a scheduled run and a
 * manual run must produce the same work and the same counts.
 *
 * THE SECRET IS THE ONLY GATE. There is no session on a cron request, so this
 * route deliberately skips the same-origin check that browser mutations use. The
 * bearer comparison is constant-time so a wrong secret cannot be discovered one
 * character at a time, and it fails closed: with no `CRON_SECRET` configured the
 * route answers 401 for everyone rather than becoming an open sweep trigger for
 * anyone who finds the URL.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  /** Also send the grade and attendance digest. */
  summary: z.boolean().optional(),
  /** Restrict the run to one teacher, for a manual check. */
  ownerId: z.uuid().optional(),
});

function isAuthorised(request: Request, secret: string): boolean {
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  // timingSafeEqual throws on a length mismatch, so unequal lengths are rejected
  // first and the comparison itself only ever sees equal-length buffers.
  const given = Buffer.from(presented);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) return false;

  return timingSafeEqual(given, expected);
}

function unauthorised() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Both verbs authorise before touching the body, so a wrong secret learns nothing. */
async function authorised(request: Request): Promise<boolean> {
  const { cronSecret } = await serverEnv();
  return isAuthorised(request, cronSecret);
}

async function run(options: { summary: boolean; ownerId?: string }) {
  const sweep = await runAtRiskSweep({
    includeSummary: options.summary,
    ownerId: options.ownerId,
  });

  return NextResponse.json({ ok: true, ...sweep });
}

export async function GET(request: Request) {
  if (!(await authorised(request))) return unauthorised();

  const url = new URL(request.url);

  try {
    return await run({
      summary: url.searchParams.get('summary') === 'true',
      ownerId: url.searchParams.get('owner') ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: 'The at-risk sweep could not run' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authorised(request))) return unauthorised();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid sweep request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return await run({
      summary: parsed.data.summary ?? false,
      ownerId: parsed.data.ownerId,
    });
  } catch {
    return NextResponse.json({ error: 'The at-risk sweep could not run' }, { status: 500 });
  }
}