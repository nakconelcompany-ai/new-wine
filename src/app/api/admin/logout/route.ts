import { json, handleError, checkOrigin } from '@/lib/http';
import { endSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await endSession();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
