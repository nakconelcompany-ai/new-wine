import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { env, HttpError } from './env';
import { query } from './db';
import { checkOrigin } from './http';

export const COOKIE = 'nw_admin';
const SESSION_HOURS = 8;

const secretKey = () => new TextEncoder().encode(env.sessionSecret);

/** The active password hash: one set from the dashboard wins over the ADMIN_PASSWORD_HASH env var. */
export async function activePasswordHash(): Promise<string> {
  const rows = await query<{ password_hash: string }>('SELECT password_hash FROM admin_credentials WHERE id = 1');
  return rows[0]?.password_hash ?? env.adminPasswordHash;
}

const fingerprint = (hash: string) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

export async function verifyLogin(email: string, password: string): Promise<boolean> {
  const hash = await activePasswordHash();
  const emailOk = (() => {
    const a = Buffer.from(email.trim().toLowerCase());
    const b = Buffer.from(env.adminEmail);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  })();
  // Always run bcrypt so response time doesn't reveal whether the email was right.
  const pwOk = await bcrypt.compare(password, hash).catch(() => false);
  return emailOk && pwOk;
}

export async function startSession(): Promise<void> {
  const hash = await activePasswordHash();
  const token = await new SignJWT({ pv: fingerprint(hash) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
}

export async function isAdmin(): Promise<boolean> {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (payload.sub !== 'admin') return false;
    // Changing the password invalidates every older session.
    return payload.pv === fingerprint(await activePasswordHash());
  } catch {
    return false;
  }
}

/** Call at the top of every privileged route. Mutating requests also get an Origin (CSRF) check. */
export async function requireAdmin(req: Request): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
  if (!(await isAdmin())) throw new HttpError(401, 'Please sign in again.');
}
