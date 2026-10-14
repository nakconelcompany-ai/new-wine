import { z } from 'zod';
import { query } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, readJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { generateCode, hashCode } from '@/lib/codes';

export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({ count: z.number().int().min(1).max(500) }),
  z.object({ labels: z.array(z.string().trim().min(1).max(60)).min(1).max(500) }),
]);

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const rows = await query<{ id: string; label: string | null; status: string; used_at: Date | null; created_at: Date }>(
      'SELECT id, label, status, used_at, created_at FROM voter_codes ORDER BY created_at DESC, id LIMIT 2000'
    );
    return json({ codes: rows.map((r) => ({ id: r.id, label: r.label, status: r.status, usedAt: r.used_at, createdAt: r.created_at })) });
  } catch (e) {
    return handleError(e);
  }
}

// Plain-text codes are returned ONCE here; only a keyed hash is stored.
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const b = Body.parse(await readJson(req));
    const labels: (string | null)[] = 'labels' in b ? b.labels : Array.from({ length: b.count }, () => null);

    for (let attempt = 0; attempt < 3; attempt++) {
      const codes = labels.map(() => generateCode());
      try {
        await query(
          `INSERT INTO voter_codes (code_hash, label)
           SELECT t.h, t.l FROM unnest($1::text[], $2::text[]) AS t(h, l)`,
          [codes.map(hashCode), labels]
        );
        return json({ ok: true, codes: codes.map((code, i) => ({ code, label: labels[i] })) }, 201);
      } catch (e) {
        if ((e as { code?: string }).code !== '23505') throw e; // hash collision: regenerate
      }
    }
    throw new HttpError(500, 'Could not generate unique codes. Please try again.');
  } catch (e) {
    return handleError(e);
  }
}
