import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './env';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function handleError(e: unknown) {
  if (e instanceof HttpError) {
    if (e.status >= 500) console.error('[api]', e.message);
    return json({ error: e.publicMessage, ...(e.extra ?? {}) }, e.status);
  }
  if (e instanceof ZodError) {
    return json({ error: e.issues[0]?.message ?? 'Invalid request.' }, 400);
  }
  console.error('[api] unexpected error:', e instanceof Error ? e.message : 'unknown');
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  ).slice(0, 64);
}

/** CSRF defence for state-changing requests: Origin must match our own host. */
export function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!origin || !host) throw new HttpError(403, 'Request blocked.');
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, 'Request blocked.'); }
  if (originHost !== host) throw new HttpError(403, 'Request blocked.');
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > 200_000) throw new HttpError(413, 'Request too large.');
  try { return await req.json(); } catch { throw new HttpError(400, 'Invalid request body.'); }
}
