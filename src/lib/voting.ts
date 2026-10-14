import { query } from './db';

export type VotingRow = {
  status: 'draft' | 'open' | 'closed';
  method: 'codes' | 'open';
  starts_at: Date | null;
  ends_at: Date | null;
  results_published: boolean;
  results_published_at: Date | null;
};

export type Phase = 'not_open' | 'open' | 'closed';

export async function getConfig(q: typeof query = query): Promise<VotingRow> {
  const rows = await q<VotingRow>('SELECT status, method, starts_at, ends_at, results_published, results_published_at FROM voting_config WHERE id = 1');
  return rows[0];
}

/** What voters actually experience right now, combining the admin switch and the schedule. */
export function effectivePhase(cfg: VotingRow, now = new Date()): { phase: Phase; scheduled: boolean } {
  if (cfg.status === 'closed') return { phase: 'closed', scheduled: false };
  if (cfg.status === 'draft') return { phase: 'not_open', scheduled: false };
  if (cfg.starts_at && now < cfg.starts_at) return { phase: 'not_open', scheduled: true };
  if (cfg.ends_at && now >= cfg.ends_at) return { phase: 'closed', scheduled: false };
  return { phase: 'open', scheduled: false };
}

export const ELIGIBLE_NOMINEE = 'n.published = true AND n.archived_at IS NULL';

/** Required categories that still have no published, non-archived nominee. */
export async function categoriesMissingNominees(): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM categories c
     WHERE c.required = true
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
    query<{ n: number }>('SELECT count(*)::int AS n FROM categories WHERE required = true'),
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
