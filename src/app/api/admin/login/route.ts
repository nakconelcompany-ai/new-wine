import { z } from 'zod';
import { HttpError } from '@/lib/env';
import { json, handleError, checkOrigin, clientIp, readJson } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { verifyLogin, startSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const Body = z.object({ email: z.string().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ip = clientIp(req);
    if ((await hit(`login:${ip}`, 900)) > 8 || (await hit('login:all', 900)) > 80) {
      throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }
    const { email, password } = Body.parse(await readJson(req));
    if (!(await verifyLogin(email, password))) throw new HttpError(401, 'Incorrect email or password.');
    await startSession();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
