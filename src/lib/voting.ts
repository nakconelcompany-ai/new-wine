import { query } from './db';

export type VotingRow = {
  status: 'draft' | 'open' | 'closed';
  method: 'codes' | 'open';
  results_published: boolean;
  results_published_at: Date | null;
};

export type Phase = 'not_open' | 'open' | 'closed';

export async function getConfig(q: typeof query = query): Promise<VotingRow> {
  const rows = await q<VotingRow>('SELECT status, method, results_published, results_published_at FROM voting_config WHERE id = 1');
  return rows[0];
}

/** What voters experience: it follows the admin's Open/Close switch only. There is no schedule, so voting is open 24/7. */
export function effectivePhase(cfg: VotingRow): { phase: Phase } {
  if (cfg.status === 'closed') return { phase: 'closed' };
  if (cfg.status === 'draft') return { phase: 'not_open' };
  return { phase: 'open' };
}

export const ELIGIBLE_NOMINEE = 'n.published = true AND n.archived_at IS NULL';

/** Required categories that still have no published, non-archived nominee. */
export async function categoriesMissingNominees(): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM categories c
     WHERE c.required = true AND c.active
       AND NOT EXISTS (SELECT 1 FROM nominees n WHERE n.category_id = c.id AND ${ELIGIBLE_NOMINEE})
     ORDER BY c.display_order`
  );
}

export async function readiness() {
  const [cfg, missing, codes, cats] = await Promise.all([
    getConfig(),
    categoriesMissingNominees(),
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM voter_codes
       WHERE kind = 'code' AND status = 'active' AND used_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
    ),
    query<{ n: number }>('SELECT count(*)::int AS n FROM categories WHERE required = true AND active'),
  ]);
  const unusedCodes = codes[0].n;
  return {
    method: cfg.method,
    categoriesMissingNominees: missing.map((m) => m.name),
    unusedCodes,
    requiredCategories: cats[0].n,
    ready: missing.length === 0 && (cfg.method === 'open' || unusedCodes > 0) && cats[0].n > 0,
  };
}
