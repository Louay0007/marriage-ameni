import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import type { Message } from '@marriage/shared';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { fingerprintToken } from './auth/token.js';
import type {
  ContractRepository,
  ContractRow,
} from './repositories/contracts.js';
import type { MessageRepository } from './repositories/messages.js';
import { registerRoomHandlers } from './sockets/registerRoomHandlers.js';
import type { ContractLifecycle } from './services/finalizeContract.js';

const contractId = '11111111-1111-4111-8111-111111111111';
const louayToken = 'louay-local-demo-token-0000000000000001';
const ameniToken = 'ameni-local-demo-token-0000000000000001';
const viewerToken = 'guest-local-demo-token-0000000000000001';
const config: Config = {
  nodeEnv: 'development',
  port: 3000,
  publicOrigin: 'http://localhost:5173',
  databaseUrl: 'in-memory',
  storageDir: resolve('storage'),
  sessionSecret: 'local-demo-session-secret-000000000000',
  tokenPepper: 'local-demo-token-pepper',
  sessionTtlSeconds: 86_400,
  maxSignatureBytes: 2_097_152,
  puppeteerExecutablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};

let contract: ContractRow = {
  id: contractId,
  party_a_name: 'Louay',
  party_b_name: 'Ameni',
  party_a_token_hash: fingerprintToken(louayToken, config.tokenPepper),
  party_b_token_hash: fingerprintToken(ameniToken, config.tokenPepper),
  viewer_token_hash: fingerprintToken(viewerToken, config.tokenPepper),
  party_a_seal_key: null,
  party_b_seal_key: null,
  party_a_signature_path: null,
  party_b_signature_path: null,
  party_a_sealed_at: null,
  party_b_sealed_at: null,
  finalization_status: 'pending',
  finalized_at: null,
  pdf_path: null,
};
const contracts: ContractRepository = {
  findById: async (id) => (id === contractId ? contract : null),
  isPartySealed: async (_id, party) =>
    Boolean(
      party === 'party_a'
        ? contract.party_a_sealed_at
        : contract.party_b_sealed_at,
    ),
  create: async () => contractId,
  seal: async (_id, party, path, key) => {
    const currentKey =
      party === 'party_a'
        ? contract.party_a_seal_key
        : contract.party_b_seal_key;
    if (currentKey === key) return { contract, created: false };
    if (
      party === 'party_a'
        ? contract.party_a_sealed_at
        : contract.party_b_sealed_at
    )
      throw new Error('ALREADY_SEALED');
    const now = new Date();
    contract = {
      ...contract,
      ...(party === 'party_a'
        ? {
            party_a_signature_path: path,
            party_a_sealed_at: now,
            party_a_seal_key: key,
          }
        : {
            party_b_signature_path: path,
            party_b_sealed_at: now,
            party_b_seal_key: key,
          }),
    };
    return { contract, created: true };
  },
  claimFinalization: async () => {
    if (
      !contract.party_a_sealed_at ||
      !contract.party_b_sealed_at ||
      !['pending', 'failed'].includes(contract.finalization_status)
    )
      return null;
    contract = { ...contract, finalization_status: 'processing' };
    return contract;
  },
  completeFinalization: async (_id, path) => {
    contract = {
      ...contract,
      finalization_status: 'complete',
      finalized_at: new Date(),
      pdf_path: path,
    };
    return contract;
  },
  failFinalization: async () => {
    contract = { ...contract, finalization_status: 'failed' };
  },
};
const messageRows: Message[] = [];
const messages: MessageRepository = {
  listRecent: async () => messageRows,
  create: async ({ sender, clientId, body }) => {
    const existing = messageRows.find(
      (item) => item.sender === sender && item.clientId === clientId,
    );
    if (existing) return existing;
    const message: Message = {
      id: crypto.randomUUID(),
      clientId,
      sender,
      body,
      createdAt: new Date().toISOString(),
      seenAt: null,
    };
    messageRows.push(message);
    return message;
  },
};

const lifecycle: ContractLifecycle = {
  sealed: (id, payload) =>
    io.to(`contract:${id}`).emit('contract:sealed', payload),
  finalizing: (id) =>
    io.to(`contract:${id}`).emit('contract:finalizing', { contractId: id }),
  finalized: (id, payload) =>
    io.to(`contract:${id}`).emit('contract:finalized', payload),
  failed: (id) => io.to(`contract:${id}`).emit('contract:finalization_failed'),
};
const httpServer = createServer(
  createApp(config, contracts, messages, async () => true, lifecycle),
);
const io = new Server(httpServer, {
  cors: { origin: config.publicOrigin, credentials: true },
});
registerRoomHandlers(io, config, contracts, messages);
httpServer.listen(config.port, () => {
  console.log(
    `Louay: ${config.publicOrigin}/c/${contractId}?key=${louayToken}`,
  );
  console.log(
    `Ameni: ${config.publicOrigin}/c/${contractId}?key=${ameniToken}`,
  );
  console.log(
    `Guest: ${config.publicOrigin}/c/${contractId}?key=${viewerToken}`,
  );
});
