import crypto from 'node:crypto';
import { env } from './env';

// No 0/O/1/I/L so codes are easy to read out and type on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Only this keyed hash is stored; the plain code is shown to the admin once, at generation time. */
export function hashCode(input: string): string {
  return crypto.createHmac('sha256', env.votePepper).update(normalizeCode(input)).digest('hex');
}
