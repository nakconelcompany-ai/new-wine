import { json, handleError } from '@/lib/http';
import { getConfig } from '@/lib/voting';
import { tally, ballotCount } from '@/lib/results';

export const dynamic = 'force-dynamic';

// Public results exist ONLY after the admin publishes them. Before that this endpoint reveals nothing.
export async function GET() {
  try {
    const cfg = await getConfig();
    if (!cfg.results_published) return json({ error: 'Results have not been published.' }, 404);
    const cats = await tally();
    return json({
      ballots: await ballotCount(),
      categories: cats.map((c) => ({
        name: c.name,
        tie: c.tie,
        totalVotes: c.totalVotes,
        winners: c.leaders.map((l) => ({ name: l.name, votes: l.votes })),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
