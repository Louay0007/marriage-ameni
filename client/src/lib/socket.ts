import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@marriage/shared';

export type ContractSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createContractSocket(): ContractSocket {
  return io({ autoConnect: false, withCredentials: true });
}
