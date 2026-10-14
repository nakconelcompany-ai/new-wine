import { query } from './db';

export type NomineeTally = { id: string; name: string; votes: number; published: boolean; archived: boolean };
export type CategoryTally = {
  id: string; name: string; order: number;
  nominees: NomineeTally[];
  totalVotes: number;
  leaders: NomineeTally[];   // everyone sharing the top vote count (more than one = a tie)
  tie: boolean;
};

export async function tally(): Promise<CategoryTally[]> {
  const rows = await query<{
    cid: string; cname: string; ord: number;
    nid: string | null; nname: string | null; published: boolean | null; archived_at: Date | null; votes: number;
  }>(
    `SELECT c.id AS cid, c.name AS cname, c.display_order AS ord,
            n.id AS nid, n.display_name AS nname, n.published, n.archived_at,
            count(bs.id)::int AS votes
     FROM categories c
     LEFT JOIN nominees n ON n.category_id = c.id
     LEFT JOIN ballot_selections bs ON bs.nominee_id = n.id
     WHERE c.active
     GROUP BY c.id, n.id
     ORDER BY c.display_order, count(bs.id) DESC, n.display_name`
  );
  const byCat = new Map<string, CategoryTally>();
  for (const r of rows) {
    let cat = byCat.get(r.cid);
    if (!cat) {
      cat = { id: r.cid, name: r.cname, order: r.ord, nominees: [], totalVotes: 0, leaders: [], tie: false };
      byCat.set(r.cid, cat);
    }
    if (r.nid) {
      // Hide never-voted nominees that are archived/unpublished; keep everyone who is active or has votes.
      const archived = r.archived_at !== null;
      if (r.votes > 0 || (r.published && !archived)) {
        cat.nominees.push({ id: r.nid, name: r.nname!, votes: r.votes, published: !!r.published, archived });
        cat.totalVotes += r.votes;
      }
    }
  }
  const out = [...byCat.values()].sort((a, b) => a.order - b.order);
  for (const cat of out) {
    const max = Math.max(0, ...cat.nominees.map((n) => n.votes));
    cat.leaders = max > 0 ? cat.nominees.filter((n) => n.votes === max) : [];
    cat.tie = cat.leaders.length > 1;
  }
  return out;
}

export async function ballotCount(): Promise<number> {
  // Only ballots that voted in a currently active category (ignores leftovers from an earlier category list).
  return (await query<{ n: number }>(
    `SELECT count(DISTINCT bs.ballot_id)::int AS n FROM ballot_selections bs JOIN categories c ON c.id = bs.category_id AND c.active`
  ))[0].n;
}
