import { json, handleError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { tally, ballotCount } from '@/lib/results';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const cats = await tally();
    return json({
      ballots: await ballotCount(),
      categories: cats.map((c) => ({
        id: c.id, name: c.name, totalVotes: c.totalVotes, tie: c.tie,
        noVotes: c.totalVotes === 0,
        leaders: c.leaders.map((l) => l.name),
        nominees: c.nominees,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
