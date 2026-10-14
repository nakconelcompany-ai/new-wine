import { query } from './db';

const WINDOW_SQL = `to_timestamp(floor(extract(epoch from now()) / $2) * $2)`;

/** Adds one hit to a fixed window and returns the new count. Stored in Postgres so it works across serverless instances. */
export async function hit(bucket: string, windowSec: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1, ${WINDOW_SQL}, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [bucket, windowSec]
  );
  if (Math.random() < 0.02) {
    query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`).catch(() => {});
  }
  return rows[0].count;
}

/** Current count without adding a hit. */
export async function peek(bucket: string, windowSec: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT count FROM rate_limits WHERE bucket = $1 AND window_start = ${WINDOW_SQL}`,
    [bucket, windowSec]
  );
  return rows[0]?.count ?? 0;
}
