import { parse } from 'cookie';
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Party,
  PresenceStatus,
} from '@marriage/shared';
import { messageSendSchema, strokeBatchSchema } from '@marriage/shared';
import type { Config } from '../config.js';
import type { ContractRepository } from '../repositories/contracts.js';
import type { MessageRepository } from '../repositories/messages.js';
import {
  SESSION_COOKIE,
  verifySession,
  type SessionIdentity,
} from '../auth/session.js';
import { StrokeCache } from './strokeCache.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  { identity: SessionIdentity }
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  { identity: SessionIdentity }
>;

export function registerRoomHandlers(
  io: TypedServer,
  config: Config,
  contracts: ContractRepository,
  messages: MessageRepository,
  strokeCache = new StrokeCache(),
) {
  const presence = new Map<
    string,
    Map<Party, Map<string, Exclude<PresenceStatus, 'offline'>>>
  >();
  const stateFor = (contractId: string): Record<Party, PresenceStatus> => {
    const room = presence.get(contractId);
    const status = (party: Party): PresenceStatus => {
      const values = [...(room?.get(party)?.values() ?? [])];
      return values.includes('signing')
        ? 'signing'
        : values.includes('online')
          ? 'online'
          : values.includes('idle')
            ? 'idle'
            : 'offline';
    };
    return { party_a: status('party_a'), party_b: status('party_b') };
  };
  const publish = (contractId: string) =>
    io
      .to(`contract:${contractId}`)
      .emit('presence:state', stateFor(contractId));

  io.use((socket, next) => {
    const value = parse(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
    const identity = verifySession(value, config);
    if (!identity) return next(new Error('unauthorized'));
    socket.data.identity = identity;
    next();
  });

  io.on('connection', (socket: TypedSocket) => {
    const { contractId, party } = socket.data.identity;
    socket.join(`contract:${contractId}`);
    const room = presence.get(contractId) ?? new Map();
    const sockets = room.get(party) ?? new Map();
    if (!socket.data.identity.readOnly) {
      sockets.set(socket.id, 'online');
      room.set(party, sockets);
      presence.set(contractId, room);
    }
    publish(contractId);
    const messageTimes: number[] = [];
    const strokeTimes: number[] = [];

    socket.on('presence:update', ({ status }, acknowledge) => {
      if (socket.data.identity.readOnly)
        return acknowledge({
          ok: false,
          error: {
            code: 'READ_ONLY',
            message: 'Guest viewers cannot update presence.',
          },
        });
      if (!['online', 'signing', 'idle'].includes(status))
        return acknowledge({
          ok: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Invalid presence status.',
          },
        });
      sockets.set(socket.id, status);
      publish(contractId);
      acknowledge({ ok: true });
    });
    socket.on('message:send', async (payload, acknowledge) => {
      if (socket.data.identity.readOnly)
        return acknowledge({
          ok: false,
          error: {
            code: 'READ_ONLY',
            message: 'Guest viewers cannot send messages.',
          },
        });
      const now = Date.now();
      while (messageTimes[0] !== undefined && messageTimes[0] < now - 5000)
        messageTimes.shift();
      if (messageTimes.length >= 5)
        return acknowledge({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Please wait before sending another message.',
          },
        });
      const parsed = messageSendSchema.safeParse(payload);
      if (!parsed.success)
        return acknowledge({
          ok: false,
          error: {
            code: 'INVALID_MESSAGE',
            message: 'Message must contain 1 to 500 characters.',
          },
        });
      try {
        messageTimes.push(now);
        const message = await messages.create({
          contractId,
          sender: party,
          clientId: parsed.data.clientId,
          body: parsed.data.body,
        });
        io.to(`contract:${contractId}`).emit('message:new', message);
        acknowledge({ ok: true, data: message });
      } catch {
        acknowledge({
          ok: false,
          error: {
            code: 'MESSAGE_FAILED',
            message: 'The message could not be saved.',
          },
        });
      }
    });
    socket.on('strokes:request', () => {
      socket.emit('strokes:snapshot', strokeCache.snapshot(contractId));
    });
    socket.on('stroke:batch', async (payload, acknowledge) => {
      if (socket.data.identity.readOnly)
        return acknowledge({
          ok: false,
          error: { code: 'READ_ONLY', message: 'Guest viewers cannot draw.' },
        });
      const now = Date.now();
      while (strokeTimes[0] !== undefined && strokeTimes[0] < now - 1000)
        strokeTimes.shift();
      if (strokeTimes.length >= 40)
        return acknowledge({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Drawing updates are arriving too quickly.',
          },
        });
      const parsed = strokeBatchSchema.safeParse(payload);
      if (!parsed.success)
        return acknowledge({
          ok: false,
          error: { code: 'INVALID_STROKE', message: 'Invalid stroke data.' },
        });
      if (await contracts.isPartySealed(contractId, party))
        return acknowledge({
          ok: false,
          error: {
            code: 'SEALED',
            message: 'This signature is already sealed.',
          },
        });
      try {
        strokeTimes.push(now);
        const sequence = strokeCache.append(contractId, party, parsed.data);
        socket
          .to(`contract:${contractId}`)
          .emit('stroke:batch', { ...parsed.data, party, sequence });
        acknowledge({ ok: true, data: { sequence } });
      } catch {
        acknowledge({
          ok: false,
          error: {
            code: 'STROKE_LIMIT',
            message: 'The signature is too complex.',
          },
        });
      }
    });
    socket.on('stroke:clear', async (acknowledge) => {
      if (socket.data.identity.readOnly)
        return acknowledge({
          ok: false,
          error: {
            code: 'READ_ONLY',
            message: 'Guest viewers cannot clear signatures.',
          },
        });
      if (await contracts.isPartySealed(contractId, party))
        return acknowledge({
          ok: false,
          error: {
            code: 'SEALED',
            message: 'This signature is already sealed.',
          },
        });
      strokeCache.clear(contractId, party);
      socket.to(`contract:${contractId}`).emit('stroke:clear', { party });
      acknowledge({ ok: true });
    });
    socket.on('disconnect', () => {
      if (socket.data.identity.readOnly) return;
      sockets.delete(socket.id);
      if (sockets.size === 0) room.delete(party);
      if (room.size === 0) presence.delete(contractId);
      publish(contractId);
    });
  });
}
