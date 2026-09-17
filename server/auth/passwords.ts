import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt (Node stdlib, no native build dependencies) for password hashing.
 *  Stored format: "scrypt:<base64 salt>:<base64 key>". Verification compares
 *  digests with timingSafeEqual so it does not leak information by timing. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

/** Verified even when the account does not exist, so login responses take a
 *  similar amount of time whether or not an email is registered. */
export const DUMMY_PASSWORD_HASH = hashPassword('timing-equalizer-not-a-real-password');
