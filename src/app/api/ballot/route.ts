import { query } from '@/lib/db';
import { json, handleError } from '@/lib/http';
import { getConfig, effectivePhase, categoriesMissingNominees, ELIGIBLE_NOMINEE } from '@/lib/voting';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = await getConfig();
    const { phase } = effectivePhase(cfg);
    const base = {
      phase: phase as string,
      resultsPublished: cfg.results_published,
      ballotResetAt: cfg.ballots_reset_at,
    };
    if (phase !== 'open') return json(base);

    // Never open a ballot that has a category with nobody to vote for.
    if ((await categoriesMissingNominees()).length > 0) {
      return json({ ...base, phase: 'unavailable' });
    }
    const rows = await query<{ cid: string; ckey: string; cname: string; ord: number; nid: string; nname: string }>(
      `SELECT c.id AS cid, c.key AS ckey, c.name AS cname, c.display_order AS ord, n.id AS nid, n.display_name AS nname
       FROM categories c JOIN nominees n ON n.category_id = c.id
       WHERE c.required = true AND c.active AND ${ELIGIBLE_NOMINEE}
       ORDER BY c.display_order, n.display_name`
    );
    const cats = new Map<string, { id: string; key: string; name: string; nominees: { id: string; name: string }[] }>();
    for (const r of rows) {
      if (!cats.has(r.cid)) cats.set(r.cid, { id: r.cid, key: r.ckey, name: r.cname, nominees: [] });
      cats.get(r.cid)!.nominees.push({ id: r.nid, name: r.nname });
    }
    return json({ ...base, categories: [...cats.values()] });
  } catch (e) {
    return handleError(e);
  }
}
