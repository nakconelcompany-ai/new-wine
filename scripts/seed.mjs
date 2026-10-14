// Idempotent seed. Safe to run any number of times.
//  * categories: upserted by stable key; any category NOT in this list is switched off (never deleted)
//  * nominees:   inserted ONCE (tracked in _migrations), so later renames/archives made in the dashboard are never undone
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// [key, display name, [nominees]]
export const CATEGORIES = [
  ['voice-of-the-year-male', 'Voice of the Year (Male)', ['Bro J-voiz', 'Bro Sam', 'Bro Eniola']],
  ['voice-of-the-year-female', 'Voice of the Year (Female)', ['Sis Lulu', 'Sis Seyi', 'Sis Kenny', 'Sis Chiamaka']],
  ['upcoming-voice-male', 'Upcoming Voice (Male)', ['Bro Irey', 'Bro Stephen']],
  ['upcoming-voice-female', 'Upcoming Voice (Female)', ['Sis Winnie', 'Sis Joy']],
  ['most-dedicated-punctual-member', 'Most Dedicated / Punctual Member', ['Sis Taiwo', 'Sis Lolade', 'Sis Àràmide', 'Bro Stephen']],
  ['upcoming-praise-leader-male', 'Upcoming Praise Leader (Male)', ['Bro Ire', 'Bro Enny']],
  ['upcoming-praise-leader-female', 'Upcoming Praise Leader (Female)', ['Sis Taiwo', 'Sis Aramide']],
  ['most-compliant-uniform-male', 'Most Compliant in Uniform (Male)', ['Bro Stephen', 'Bro Miracle Odeleke']],
  ['most-compliant-uniform-female', 'Most Compliant in Uniform (Female)', ['Sis Ewa', 'Sis Lolade', 'Sis Tosin Shari']],
  ['most-energetic-female', 'Most Energetic (Female)', ['Sis Kenny', 'Sis Sheyi', 'Sis Grace', 'Sis Tosin Folarin']],
  ['most-energetic-male', 'Most Energetic (Male)', ['Bro J-voiz', 'Bro Sam', 'Bro Stephen']],
  ['power-house-personality-male', 'Power House Personality (Male)', ['Bro Sayo', 'Bro J-voiz', 'Bro Miracle', 'Bro Ire']],
  ['power-house-personality-female', 'Power House Personality (Female)', ['Sis Taiwo', 'Sis Seyi', 'Sis Tosin Folarin', 'Sis Tomiwa']],
  ['most-funny', 'Most Funny', ['Bro Toyosi', 'Bro Miracle']],
  ['best-dancer-praise-male', 'Best Dancer During Praise (Male)', ['Bro Stephen', 'Bro Miracle Daniel']],
  ['best-dancer-praise-female', 'Best Dancer During Praise (Female)', ['Sis Dammy', 'Sis Wade']],
  ['most-active-musician', 'Most Active Musician', ['Bro Sayo', 'Bro Ope', 'Bro Lamar', 'Bro Toyosi']],
];

const NOMINEES_MARKER = 'seed-nominees-yearly-award-v1';
const cleanName = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const nameKey = (s) => cleanName(s).toLocaleLowerCase('en'); // same rule the admin API uses

export async function seed(connectionString = process.env.DATABASE_URL, { nominees = process.env.SEED_NOMINEES !== 'false' } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < CATEGORIES.length; i++) {
      const [key, name] = CATEGORIES[i];
      await client.query(
        `INSERT INTO categories (key, name, display_order, required, active)
         VALUES ($1, $2, $3, true, true)
         ON CONFLICT (key) DO UPDATE
           SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, required = true, active = true, updated_at = now()`,
        [key, name, i + 1]
      );
    }
    const off = await client.query(
      `UPDATE categories SET active = false, updated_at = now() WHERE active AND key <> ALL($1::text[])`,
      [CATEGORIES.map((c) => c[0])]
    );
    await client.query('INSERT INTO voting_config (id) VALUES (1) ON CONFLICT DO NOTHING');

    let addedNominees = 0;
    if (nominees) {
      const first = await client.query(`INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING name`, [NOMINEES_MARKER]);
      if (first.rowCount) {
        for (const [key, , names] of CATEGORIES) {
          for (const n of names) {
            const r = await client.query(
              `INSERT INTO nominees (category_id, display_name, name_key, published)
               SELECT c.id, $2::text, $3::text, true FROM categories c WHERE c.key = $1::text
               ON CONFLICT (category_id, name_key) DO NOTHING`,
              [key, cleanName(n), nameKey(n)]
            );
            addedNominees += r.rowCount;
          }
        }
      }
    }
    await client.query('COMMIT');
    const { rows } = await client.query('SELECT count(*) FILTER (WHERE active)::int AS active, count(*)::int AS total FROM categories');
    console.log(`[seed] active categories: ${rows[0].active}${off.rowCount ? ` (switched off ${off.rowCount} old)` : ''}; nominees added this run: ${addedNominees}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
