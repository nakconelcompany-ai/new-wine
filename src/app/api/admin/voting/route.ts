import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { query, tx } from '@/lib/db';
import { HttpError } from '@/lib/env';
import { json, handleError, readJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { getConfig, effectivePhase, readiness } from '@/lib/voting';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check') }),
  z.object({ action: z.literal('open') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('publish_results') }),
  z.object({ action: z.literal('unpublish_results') }),
  z.object({ action: z.literal('reset_ballots'), confirmation: z.literal('reset') }),
]);

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const b = Body.parse(await readJson(req));
    const cfg = await getConfig();

    switch (b.action) {
      case 'check':
        return json({ ok: true, readiness: await readiness() });

      case 'open': {
        if (cfg.results_published) throw new HttpError(409, 'Results are already published. Unpublish them before reopening voting.');
        const r = await readiness();
        if (r.categoriesMissingNominees.length) {
          throw new HttpError(409, 'Voting cannot open until every category has at least one published nominee.', undefined, { readiness: r });
        }
        await query(`UPDATE voting_config SET status = 'open', updated_at = now() WHERE id = 1`);
        break;
      }

      case 'close':
        await query(`UPDATE voting_config SET status = 'closed', updated_at = now() WHERE id = 1`);
        break;

      case 'publish_results':
        if (effectivePhase(cfg).phase !== 'closed') throw new HttpError(409, 'Close voting before publishing results.');
        await query('UPDATE voting_config SET results_published = true, results_published_at = now(), updated_at = now() WHERE id = 1');
        break;

      case 'unpublish_results':
        await query('UPDATE voting_config SET results_published = false, results_published_at = NULL, updated_at = now() WHERE id = 1');
        break;

      case 'reset_ballots':
        if (cfg.status === 'open') throw new HttpError(409, 'Close voting before resetting ballots.');
        await tx(async (c) => {
          await c.query('DELETE FROM ballots');
          await c.query("DELETE FROM voter_codes WHERE kind = 'device'");
          await c.query('UPDATE voting_config SET results_published = false, results_published_at = NULL, ballots_reset_at = now(), updated_at = now() WHERE id = 1');
        });
        break;
    }
    revalidatePath('/');
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
