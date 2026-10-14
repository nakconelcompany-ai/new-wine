import { query } from '@/lib/db';
import { json, handleError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { getConfig, effectivePhase, readiness } from '@/lib/voting';
import { ballotCount } from '@/lib/results';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const [cfg, ready, ballots, categories, nominees, codeStats, activity] = await Promise.all([
      getConfig(),
      readiness(),
      ballotCount(),
      query<{ id: string; name: string; display_order: number }>('SELECT id, name, display_order FROM categories ORDER BY display_order'),
      query<{ id: string; category_id: string; display_name: string; published: boolean; archived_at: Date | null }>(
        'SELECT id, category_id, display_name, published, archived_at FROM nominees ORDER BY display_name'
      ),
      query<{ total: number; used: number; revoked: number }>(
        `SELECT count(*)::int AS total, count(used_at)::int AS used, count(*) FILTER (WHERE status = 'revoked')::int AS revoked FROM voter_codes WHERE kind = 'code'`
      ),
      query<{ category_id: string; votes: number }>('SELECT category_id, count(*)::int AS votes FROM ballot_selections GROUP BY category_id'),
    ]);
    const { phase, scheduled } = effectivePhase(cfg);
    const votesByCat = new Map(activity.map((a) => [a.category_id, a.votes]));
    return json({
      config: {
        status: cfg.status, method: cfg.method, phase, scheduled,
        startsAt: cfg.starts_at, endsAt: cfg.ends_at,
        resultsPublished: cfg.results_published, resultsPublishedAt: cfg.results_published_at,
      },
      readiness: ready,
      stats: {
        categories: categories.length,
        publishedNominees: nominees.filter((n) => n.published && !n.archived_at).length,
        ballots,
        codes: codeStats[0],
      },
      categories: categories.map((c) => ({
        id: c.id, name: c.name,
        eligibleNominees: nominees.filter((n) => n.category_id === c.id && n.published && !n.archived_at).length,
        votesRecorded: votesByCat.get(c.id) ?? 0,
      })),
      nominees: nominees.map((n) => ({
        id: n.id, categoryId: n.category_id, name: n.display_name, published: n.published, archived: !!n.archived_at,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
