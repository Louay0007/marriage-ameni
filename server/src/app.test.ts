import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Config } from './config.js';
import { createApp } from './app.js';
import { fingerprintToken } from './auth/token.js';
import type {
  ContractRepository,
  ContractRow,
} from './repositories/contracts.js';
import type { MessageRepository } from './repositories/messages.js';

const config: Config = {
  nodeEnv: 'test',
  port: 3000,
  publicOrigin: 'http://localhost:5173',
  databaseUrl: 'unused',
  storageDir: './storage',
  sessionSecret: 's'.repeat(32),
  tokenPepper: 'pepper-for-testing',
  sessionTtlSeconds: 3600,
  maxSignatureBytes: 2_097_152,
};
const token = 'a'.repeat(43);
const viewerToken = 'v'.repeat(43);
const row: ContractRow = {
  id: '11111111-1111-4111-8111-111111111111',
  party_a_name: 'Louay',
  party_b_name: 'Ameni',
  party_a_token_hash: fingerprintToken(token, config.tokenPepper),
  party_b_token_hash: fingerprintToken('b'.repeat(43), config.tokenPepper),
  viewer_token_hash: fingerprintToken(viewerToken, config.tokenPepper),
  party_a_seal_key: null,
  party_b_seal_key: null,
  party_a_sealed_at: null,
  party_b_sealed_at: null,
  party_a_signature_path: null,
  party_b_signature_path: null,
  finalized_at: null,
  finalization_status: 'pending',
  pdf_path: null,
};
const contracts: ContractRepository = {
  findById: async (id) => (id === row.id ? row : null),
  create: async () => row.id,
  isPartySealed: async () => false,
  seal: async () => ({ contract: row, created: true }),
  claimFinalization: async () => null,
  completeFinalization: async () => row,
  failFinalization: async () => undefined,
};
const messages: MessageRepository = {
  listRecent: async () => [],
  create: async (input) => ({
    id: crypto.randomUUID(),
    clientId: input.clientId,
    sender: input.sender,
    body: input.body,
    createdAt: new Date().toISOString(),
    seenAt: null,
  }),
};

describe('authenticated contract API', () => {
  it('exchanges a private token and loads only its contract', async () => {
    const app = createApp(config, contracts, messages);
    const exchange = await request(app)
      .post('/api/auth/exchange')
      .send({ contractId: row.id, token })
      .expect(200);
    const cookie = exchange.headers['set-cookie']?.[0];
    if (!cookie) throw new Error('Expected authentication cookie');
    expect(cookie).toContain('HttpOnly');
    expect(JSON.stringify(exchange.body)).not.toContain(token);
    const loaded = await request(app)
      .get(`/api/contracts/${row.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(loaded.body.contract).toMatchObject({
      authenticatedParty: 'party_a',
      partyAName: 'Louay',
    });
    await request(app)
      .get('/api/contracts/22222222-2222-4222-8222-222222222222')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('rejects a modified token and reports failed readiness', async () => {
    const app = createApp(config, contracts, messages, async () => false);
    await request(app)
      .post('/api/auth/exchange')
      .send({ contractId: row.id, token: 'x'.repeat(43) })
      .expect(401);
    await request(app)
      .get('/api/health/ready')
      .expect(503, { status: 'unavailable' });
  });

  it('exchanges the guest token for read-only access', async () => {
    const app = createApp(config, contracts, messages);
    const response = await request(app)
      .post('/api/auth/exchange')
      .send({ contractId: row.id, token: viewerToken })
      .expect(200);
    expect(response.body.contract.readOnly).toBe(true);
  });
});
