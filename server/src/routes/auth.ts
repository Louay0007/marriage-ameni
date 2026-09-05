import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { ContractRepository } from '../repositories/contracts.js';
import { toContractView } from '../repositories/contracts.js';
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from '../auth/session.js';
import { tokenMatches } from '../auth/token.js';

const exchangeSchema = z.object({
  contractId: z.string().uuid(),
  token: z.string().min(32).max(256),
});

export function authRouter(config: Config, contracts: ContractRepository) {
  const router = Router();
  router.post('/exchange', async (request, response) => {
    const parsed = exchangeSchema.safeParse(request.body);
    if (!parsed.success)
      return response.status(400).json({
        error: {
          code: 'INVALID_LINK',
          message: 'This private link is invalid.',
          requestId: response.locals.requestId,
        },
      });
    const contract = await contracts.findById(parsed.data.contractId);
    if (!contract)
      return response.status(401).json({
        error: {
          code: 'INVALID_LINK',
          message: 'This private link is invalid.',
          requestId: response.locals.requestId,
        },
      });
    const signingParty = tokenMatches(
      parsed.data.token,
      contract.party_a_token_hash,
      config.tokenPepper,
    )
      ? 'party_a'
      : tokenMatches(
            parsed.data.token,
            contract.party_b_token_hash,
            config.tokenPepper,
          )
        ? 'party_b'
        : null;
    const viewer = Boolean(
      contract.viewer_token_hash &&
      tokenMatches(
        parsed.data.token,
        contract.viewer_token_hash,
        config.tokenPepper,
      ),
    );
    if (!signingParty && !viewer)
      return response.status(401).json({
        error: {
          code: 'INVALID_LINK',
          message: 'This private link is invalid.',
          requestId: response.locals.requestId,
        },
      });
    const party = signingParty ?? 'party_a';
    response.cookie(
      SESSION_COOKIE,
      createSession(
        { contractId: contract.id, party, readOnly: viewer },
        config,
      ),
      sessionCookieOptions(config),
    );
    return response.json({ contract: toContractView(contract, party, viewer) });
  });
  router.post('/logout', (_request, response) => {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).end();
  });
  return router;
}
