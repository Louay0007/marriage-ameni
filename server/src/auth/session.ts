import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Party } from '@marriage/shared';
import type { Config } from '../config.js';

export const SESSION_COOKIE = 'marriage_session';

export type SessionIdentity = {
  contractId: string;
  party: Party;
  readOnly?: boolean;
  expiresAt: number;
};

function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(
  identity: Omit<SessionIdentity, 'expiresAt'>,
  config: Config,
) {
  const payload = Buffer.from(
    JSON.stringify({
      ...identity,
      expiresAt: Date.now() + config.sessionTtlSeconds * 1000,
    }),
  ).toString('base64url');
  return `${payload}.${signature(payload, config.sessionSecret)}`;
}

export function verifySession(
  value: string | undefined,
  config: Config,
): SessionIdentity | null {
  if (!value) return null;
  const [payload, provided] = value.split('.');
  if (!payload || !provided) return null;
  const actualBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(signature(payload, config.sessionSecret));
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  )
    return null;
  try {
    const identity = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as SessionIdentity;
    if (
      !identity.contractId ||
      !['party_a', 'party_b'].includes(identity.party) ||
      identity.expiresAt <= Date.now()
    )
      return null;
    return identity;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(config: Config) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    maxAge: config.sessionTtlSeconds * 1000,
    path: '/',
  };
}
