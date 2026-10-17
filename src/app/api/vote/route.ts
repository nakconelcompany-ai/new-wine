import crypto from 'node:crypto';
import { z } from 'zod';
import { tx } from '@/lib/db';
import { HttpError, env } from '@/lib/env';
import { json, handleError, checkOrigin, clientIp, readJson } from '@/lib/http';
import { hit, peek } from '@/lib/ratelimit';
import { getConfig, effectivePhase, ELIGIBLE_NOMINEE } from '@/lib/voting';
import { DEVICE_COOKIE, deviceHash, readDeviceToken } from '@/lib/device';

export const dynamic = 'force-dynamic';

const Body = z.object({
  selections: z.record(z.string().uuid(), z.string().uuid()),
});

export async function POST(req: Request) {
  let ip = 'unknown';
  let newToken: string | null = null;
  try {
    checkOrigin(req);
    ip = clientIp(req);
    if ((await hit(`vote:${ip}`, 600)) > 30) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
    const body = Body.parse(await readJson(req));

    await tx(async (c) => {
      const q = async <T,>(text: string, params: unknown[] = []) => (await c.query(text, params as never[])).rows as T[];

      // 1. Voting must be open right now (checked inside the transaction).
      await c.query('SELECT 1 FROM voting_config WHERE id = 1 FOR SHARE');
      const cfg = await getConfig(q as never);
      const { phase } = effectivePhase(cfg);
      if (phase !== 'open') throw new HttpError(409, phase === 'closed' ? 'Voting has closed.' : 'Voting is not open yet.');

      // 2. Required categories, and each must have eligible nominees.
      const cats = await q<{ id: string; name: string }>('SELECT id, name FROM categories WHERE required = true AND active ORDER BY display_order');
      if (!cats.length) throw new HttpError(503, 'The ballot is not ready yet.');
      const empty = await q<{ name: string }>(
        `SELECT c.name FROM categories c WHERE c.required = true AND c.active
         AND NOT EXISTS (SELECT 1 FROM nominees n WHERE n.category_id = c.id AND ${ELIGIBLE_NOMINEE})`
      );
      if (empty.length) throw new HttpError(409, 'The ballot is being updated. Please try again shortly.');

      // 3. Claim this device. The unique token permits one ballot per device.
      let voterId: string | null = null;
      if ((await hit(`open:${ip}`, 3600)) > 40) {
        throw new HttpError(429, 'Too many ballots from this connection. Please try again later.');
      }

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

      // 5. Claim this device (unique hash = one ballot per device). Rolls back with everything else.
      let token = readDeviceToken(req);
      if (!token) { token = crypto.randomBytes(32).toString('hex'); newToken = token; }
      const ins = await q<{ id: string }>(
        `INSERT INTO voter_codes (code_hash, label, kind, used_at) VALUES ($1, 'open-link', 'device', now())
         ON CONFLICT (code_hash) DO NOTHING RETURNING id`,
        [deviceHash(token)]
      );
      if (!ins.length) throw new HttpError(409, 'You have already voted from this device. Thank you!');
      voterId = ins[0].id;

      // 6. Save ballot and all selections atomically.
      const ballot = await q<{ id: string }>('INSERT INTO ballots (voter_code_id) VALUES ($1) RETURNING id', [voterId]);
      await c.query(
        `INSERT INTO ballot_selections (ballot_id, category_id, nominee_id)
         SELECT $1, t.cat, t.nom FROM unnest($2::uuid[], $3::uuid[]) AS t(cat, nom)`,
        [ballot[0].id, cats.map((x) => x.id), nomineeIds]
      );
    });

    const res = json({ ok: true }, 201);
    if (newToken) {
      res.cookies.set(DEVICE_COOKIE, newToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  } catch (e) {
    if ((e as { code?: string })?.code === '23505') {
      return json({ error: 'You have already voted. Thank you!' }, 409);
    }
    return handleError(e);
  }
}
