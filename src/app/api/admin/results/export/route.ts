import { requireAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { tally, ballotCount } from '@/lib/results';

export const dynamic = 'force-dynamic';

// Neutralise spreadsheet formula injection and quote every field.
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const cats = await tally();
    const lines = [['Category', 'Nominee', 'Status', 'Votes', 'Result'].map(cell).join(',')];
    for (const c of cats) {
      if (!c.nominees.length) lines.push([c.name, '(no nominees)', '', 0, 'No votes'].map(cell).join(','));
      for (const n of c.nominees) {
        const leader = c.leaders.some((l) => l.id === n.id);
        const result = leader ? (c.tie ? 'Tied for lead' : 'Winner') : '';
        const status = n.archived ? 'archived' : n.published ? 'published' : 'unpublished';
        lines.push([c.name, n.name, status, n.votes, result].map(cell).join(','));
      }
    }
    lines.push('', [`Total ballots`, '', '', await ballotCount(), ''].map(cell).join(','));
    return new Response('\uFEFF' + lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="new-wine-results.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
