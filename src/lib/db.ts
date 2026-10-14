import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from './env';

const globalForPg = globalThis as unknown as { __nwPool?: Pool };

function pool(): Pool {
  if (!globalForPg.__nwPool) {
    globalForPg.__nwPool = new Pool({
      connectionString: env.databaseUrl,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
    globalForPg.__nwPool.on('error', () => { /* idle client errors are non-fatal */ });
  }
  return globalForPg.__nwPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params as never[]);
  return res.rows;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
