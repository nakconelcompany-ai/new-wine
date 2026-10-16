import { query } from './db';

export type VotingRow = {
  status: 'draft' | 'open' | 'closed';
  results_published: boolean;
  results_published_at: Date | null;
  ballots_reset_at: Date | null;
};

export type Phase = 'not_open' | 'open' | 'closed';

export async function getConfig(q: typeof query = query): Promise<VotingRow> {
  const rows = await q<VotingRow>('SELECT status, results_published, results_published_at, ballots_reset_at FROM voting_config WHERE id = 1');
  return rows[0];
}

/** Voting is controlled exclusively by the admin Open and Close buttons. */
export function effectivePhase(cfg: VotingRow, now = new Date()): { phase: Phase; scheduled: boolean } {
  if (cfg.status === 'closed') return { phase: 'closed', scheduled: false };
  if (cfg.status === 'draft') return { phase: 'not_open', scheduled: false };
  return { phase: 'open', scheduled: false };
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
  const [missing, cats] = await Promise.all([
    categoriesMissingNominees(),
    query<{ n: number }>('SELECT count(*)::int AS n FROM categories WHERE required = true AND active'),
  ]);
  return {
    categoriesMissingNominees: missing.map((m) => m.name),
    requiredCategories: cats[0].n,
    ready: missing.length === 0 && cats[0].n > 0,
  };
}
