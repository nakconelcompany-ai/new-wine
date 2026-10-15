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
      query<{ id: string; name: string; display_order: number }>('SELECT id, name, display_order FROM categories WHERE active ORDER BY display_order'),
      query<{ id: string; category_id: string; display_name: string; published: boolean; archived_at: Date | null }>(
        'SELECT n.id, n.category_id, n.display_name, n.published, n.archived_at FROM nominees n JOIN categories c ON c.id = n.category_id AND c.active ORDER BY n.display_name'
      ),
      query<{ total: number; used: number; revoked: number }>(
        `SELECT count(*)::int AS total, count(used_at)::int AS used, count(*) FILTER (WHERE status = 'revoked')::int AS revoked FROM voter_codes WHERE kind = 'code'`
      ),
      query<{ category_id: string; votes: number }>('SELECT bs.category_id, count(*)::int AS votes FROM ballot_selections bs JOIN categories c ON c.id = bs.category_id AND c.active GROUP BY bs.category_id'),
    ]);
    const { phase } = effectivePhase(cfg);
    const votesByCat = new Map(activity.map((a) => [a.category_id, a.votes]));
    return json({
      config: {
        status: cfg.status, method: cfg.method, phase,
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
