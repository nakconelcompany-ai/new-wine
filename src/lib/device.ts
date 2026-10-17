import crypto from 'node:crypto';
import { env } from './env';

export const DEVICE_COOKIE = 'nw_device';

export function deviceHash(token: string): string {
  return crypto.createHmac('sha256', env.votePepper).update(`device:${token}`).digest('hex');
}

export function readDeviceToken(req: Request): string | null {
  const match = (req.headers.get('cookie') || '').match(/(?:^|;\s*)nw_device=([a-f0-9]{64})(?:;|$)/);
  return match ? match[1] : null;
}
