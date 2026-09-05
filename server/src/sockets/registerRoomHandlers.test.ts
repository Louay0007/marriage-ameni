import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  Message,
  ServerToClientEvents,
} from '@marriage/shared';
import type { Config } from '../config.js';
import type { MessageRepository } from '../repositories/messages.js';
import { createSession, SESSION_COOKIE } from '../auth/session.js';
import { registerRoomHandlers } from './registerRoomHandlers.js';

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
const contractId = '11111111-1111-4111-8111-111111111111';
const clients: ClientSocket[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.disconnect()));

function once<T>(socket: ClientSocket, event: string) {
  return new Promise<T>((resolve) => socket.once(event, resolve));
}

describe('contract room handlers', () => {
  it('authenticates rooms, aggregates presence, and persists chat before broadcast', async () => {
    const saved: Message[] = [];
    const messages: MessageRepository = {
      listRecent: async () => saved,
      create: async (input) => {
        const message = {
          id: crypto.randomUUID(),
          clientId: input.clientId,
          sender: input.sender,
          body: input.body,
          createdAt: new Date().toISOString(),
          seenAt: null,
        } satisfies Message;
        saved.push(message);
        return message;
      },
    };
    const httpServer = createServer();
    const io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      object,
      { identity: never }
    >(httpServer);
    const contracts = {
      findById: async () => null,
      create: async () => contractId,
      isPartySealed: async () => false,
      seal: async () => {
        throw new Error('unused');
      },
      claimFinalization: async () => null,
      completeFinalization: async () => {
        throw new Error('unused');
      },
      failFinalization: async () => undefined,
    };
    registerRoomHandlers(io as never, config, contracts, messages);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const cookie = `${SESSION_COOKIE}=${createSession({ contractId, party: 'party_a' }, config)}`;
    const client = createClient(`http://127.0.0.1:${port}`, {
      extraHeaders: { Cookie: cookie },
      transports: ['websocket'],
    });
    clients.push(client);
    const connected = once(client, 'connect');
    const initialPresence = once<Record<string, string>>(
      client,
      'presence:state',
    );
    await connected;
    const presence = await initialPresence;
    expect(presence.party_a).toBe('online');
    const incoming = once<Message>(client, 'message:new');
    const acknowledgement = await new Promise<{ ok: boolean; data?: Message }>(
      (resolve) =>
        client.emit(
          'message:send',
          { clientId: crypto.randomUUID(), body: 'Always.' },
          resolve,
        ),
    );
    expect(acknowledgement.ok).toBe(true);
    expect((await incoming).body).toBe('Always.');
    expect(saved).toHaveLength(1);
    client.disconnect();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});
