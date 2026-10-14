// Runs before `next build`. On Vercel PRODUCTION builds it applies migrations + seed automatically.
// Preview builds and local builds skip it (so previews never touch production data) unless RUN_MIGRATIONS=true.
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';

const shouldRun =
  process.env.RUN_MIGRATIONS === 'true' || (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production');

if (!shouldRun) {
  console.log('[predeploy] skipping database migrations (not a production Vercel build)');
} else {
  await migrate();
  await seed();
}
