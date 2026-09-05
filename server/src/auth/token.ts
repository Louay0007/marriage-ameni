import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateAccessToken() {
  return randomBytes(32).toString('base64url');
}

export function fingerprintToken(token: string, pepper: string) {
  return createHmac('sha256', pepper).update(token).digest('hex');
}

export function tokenMatches(
  token: string,
  expectedFingerprint: string,
  pepper: string,
) {
  const actual = Buffer.from(fingerprintToken(token, pepper), 'hex');
  const expected = Buffer.from(expectedFingerprint, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
