import { z } from 'zod';
import { query } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, readJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const Body = z.object({ action: z.enum(['revoke', 'reactivate']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, 'Code not found.');
    const { action } = Body.parse(await readJson(req));
    const rows = await query<{ id: string }>(
      `UPDATE voter_codes SET status = $2 WHERE id = $1 AND used_at IS NULL RETURNING id`,
      [id, action === 'revoke' ? 'revoked' : 'active']
    );
    if (!rows.length) throw new HttpError(409, 'Code not found, or it has already been used.');
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
