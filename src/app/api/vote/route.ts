import { z } from 'zod';
import { tx } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, checkOrigin, clientIp, readJson } from '@/lib/http';
import { hit, peek } from '@/lib/ratelimit';
import { hashCode, normalizeCode } from '@/lib/codes';
import { getConfig, effectivePhase, ELIGIBLE_NOMINEE } from '@/lib/voting';

export const dynamic = 'force-dynamic';

const Body = z.object({
  code: z.string().min(1, 'Please enter your voting code.').max(40),
  selections: z.record(z.string().uuid(), z.string().uuid()),
});

export async function POST(req: Request) {
  let ip = 'unknown';
  let codeFailed = false;
  try {
    checkOrigin(req);
    ip = clientIp(req);
    if ((await hit(`vote:${ip}`, 600)) > 30) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
    const body = Body.parse(await readJson(req));
    if (normalizeCode(body.code).length !== 10) throw new HttpError(403, 'That voting code is not valid.');
    if ((await peek(`votefail:${ip}`, 900)) >= 8) throw new HttpError(429, 'Too many incorrect codes. Please wait 15 minutes and try again.');

    await tx(async (c) => {
      const q = async <T,>(text: string, params: unknown[] = []) => (await c.query(text, params as never[])).rows as T[];

      // 1. Voting must be open right now (checked inside the transaction).
      await c.query('SELECT 1 FROM voting_config WHERE id = 1 FOR SHARE');
      const { phase } = effectivePhase(await getConfig(q as never));
      if (phase !== 'open') throw new HttpError(409, phase === 'closed' ? 'Voting has closed.' : 'Voting is not open yet.');

      // 2. Required categories, and each must have eligible nominees.
      const cats = await q<{ id: string; name: string }>('SELECT id, name FROM categories WHERE required = true ORDER BY display_order');
      if (!cats.length) throw new HttpError(503, 'The ballot is not ready yet.');
      const empty = await q<{ name: string }>(
        `SELECT c.name FROM categories c WHERE c.required = true
         AND NOT EXISTS (SELECT 1 FROM nominees n WHERE n.category_id = c.id AND ${ELIGIBLE_NOMINEE})`
      );
      if (empty.length) throw new HttpError(409, 'The ballot is being updated. Please try again shortly.');

      // 3. Lock the voting code row so two simultaneous submissions cannot both succeed.
      const codes = await q<{ id: string; status: string; used_at: Date | null; expires_at: Date | null }>(
        'SELECT id, status, used_at, expires_at FROM voter_codes WHERE code_hash = $1 FOR UPDATE',
        [hashCode(body.code)]
      );
      const code = codes[0];
      if (!code || code.status !== 'active' || (code.expires_at && code.expires_at <= new Date())) {
        codeFailed = true;
        throw new HttpError(403, 'That voting code is not valid.');
      }
      if (code.used_at) throw new HttpError(409, 'This voting code has already been used.');

      // 4. Exactly one valid selection in every required category, nothing extra.
      const catIds = new Set(cats.map((x) => x.id));
      for (const k of Object.keys(body.selections)) if (!catIds.has(k)) throw new HttpError(400, 'Your ballot contains an unknown category.');
      const missing = cats.filter((x) => !body.selections[x.id]);
      if (missing.length) {
        throw new HttpError(422, 'Please choose one nominee in every category.', undefined, { missing: missing.map((m) => m.name) });
      }
      const nomineeIds = cats.map((x) => body.selections[x.id]);
      const valid = await q<{ id: string; category_id: string }>(
        `SELECT n.id, n.category_id FROM nominees n WHERE n.id = ANY($1::uuid[]) AND ${ELIGIBLE_NOMINEE}`,
        [nomineeIds]
      );
      const validMap = new Map(valid.map((v) => [v.id, v.category_id]));
      const bad = cats.filter((x) => validMap.get(body.selections[x.id]) !== x.id);
      if (bad.length) {
        throw new HttpError(422, 'Some selections are no longer valid. Please review your choices.', undefined, { missing: bad.map((b) => b.name) });
      }

      // 5. Save ballot + all selections + mark the code used, atomically.
      const ballot = await q<{ id: string }>('INSERT INTO ballots (voter_code_id) VALUES ($1) RETURNING id', [code.id]);
      await c.query(
        `INSERT INTO ballot_selections (ballot_id, category_id, nominee_id)
         SELECT $1, t.cat, t.nom FROM unnest($2::uuid[], $3::uuid[]) AS t(cat, nom)`,
        [ballot[0].id, cats.map((x) => x.id), nomineeIds]
      );
      await c.query('UPDATE voter_codes SET used_at = now() WHERE id = $1', [code.id]);
    });

    return json({ ok: true }, 201);
  } catch (e) {
    if (codeFailed) await hit(`votefail:${ip}`, 900).catch(() => {});
    if ((e as { code?: string })?.code === '23505') {
      return json({ error: 'This voting code has already been used.' }, 409);
    }
    return handleError(e);
  }
}
