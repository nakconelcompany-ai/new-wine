import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { HttpError } from '@/lib/env';
import { query } from '@/lib/db';
import { json, handleError, clientIp, readJson } from '@/lib/http';
import { hit } from '@/lib/ratelimit';
import { requireAdmin, activePasswordHash, startSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const Body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12, 'Use at least 12 characters.').max(128),
});

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    if ((await hit(`pw:${clientIp(req)}`, 900)) > 6) throw new HttpError(429, 'Too many attempts. Please wait and try again.');
    const { currentPassword, newPassword } = Body.parse(await readJson(req));
    if (!(await bcrypt.compare(currentPassword, await activePasswordHash()))) throw new HttpError(403, 'Current password is incorrect.');
    if (newPassword === currentPassword) throw new HttpError(400, 'Choose a different password.');
    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      `INSERT INTO admin_credentials (id, password_hash) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [hash]
    );
    await startSession(); // old sessions stop working; this one continues with a fresh cookie
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
