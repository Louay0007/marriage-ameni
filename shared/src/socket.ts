import type {
  Message,
  Party,
  PresenceStatus,
  StrokeBatch,
} from './contract.js';

export type SocketAcknowledgement<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: { code: string; message: string } };

export type StrokeSnapshot = {
  strokes: Record<Party, StrokeBatch[]>;
  sequences: Record<Party, number>;
};

export interface ClientToServerEvents {
  'presence:update': (
    payload: { status: Exclude<PresenceStatus, 'offline'> },
    acknowledge: (result: SocketAcknowledgement) => void,
  ) => void;
  'stroke:batch': (
    payload: StrokeBatch,
    acknowledge: (result: SocketAcknowledgement<{ sequence: number }>) => void,
  ) => void;
  'stroke:clear': (
    acknowledge: (result: SocketAcknowledgement) => void,
  ) => void;
  'strokes:request': () => void;
  'message:send': (
    payload: { clientId: string; body: string },
    acknowledge: (result: SocketAcknowledgement<Message>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'presence:state': (payload: Record<Party, PresenceStatus>) => void;
  'stroke:batch': (
    payload: StrokeBatch & { party: Party; sequence: number },
  ) => void;
  'stroke:clear': (payload: { party: Party }) => void;
  'strokes:snapshot': (payload: StrokeSnapshot) => void;
  'message:new': (payload: Message) => void;
  'contract:sealed': (payload: {
    party: Party;
    sealedAt: string;
    signatureUrl: string;
  }) => void;
  'contract:finalizing': (payload: { contractId: string }) => void;
  'contract:finalized': (payload: {
    finalizedAt: string;
    pdfUrl: string;
  }) => void;
  'contract:finalization_failed': () => void;
}
