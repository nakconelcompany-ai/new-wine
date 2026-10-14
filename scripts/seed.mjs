// Idempotent seed: the predefined categories. Safe to run any number of times.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const CATEGORIES = [
  ['voice-of-the-year', 'Voice of the Year'],
  ['best-alto', 'Best Alto'],
  ['best-soprano', 'Best Soprano'],
  ['best-tenor', 'Best Tenor'],
  ['best-bass', 'Best Bass'],
  ['most-improved-singer', 'Most Improved Singer'],
  ['best-soloist', 'Best Soloist'],
  ['most-dedicated-member', 'Most Dedicated Member'],
  ['most-reliable-member', 'Most Reliable Member'],
  ['most-cheerful-member', 'Most Cheerful Member'],
  ['choir-comedian', 'Choir Comedian (Most Funny)'],
  ['best-dressed-male', 'Best Dressed (Male)'],
  ['best-dressed-female', 'Best Dressed (Female)'],
  ['most-energetic-member', 'Most Energetic Member'],
];

export async function seed(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < CATEGORIES.length; i++) {
      const [key, name] = CATEGORIES[i];
      await client.query(
        `INSERT INTO categories (key, name, display_order, required)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, updated_at = now()`,
        [key, name, i + 1]
      );
    }
    await client.query('INSERT INTO voting_config (id) VALUES (1) ON CONFLICT DO NOTHING');
    await client.query('COMMIT');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM categories');
    console.log(`[seed] categories in database: ${rows[0].n}`);
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
