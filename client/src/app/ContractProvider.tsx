import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ContractPayload, PresenceStatus } from '@marriage/shared';
import { createContractSocket, type ContractSocket } from '../lib/socket';
import { sealContract } from '../lib/api';
import {
  contractReducer,
  createInitialState,
  type ContractState,
} from './contractReducer';

type ContractContextValue = ContractState & {
  socket: ContractSocket;
  sendMessage: (body: string) => Promise<void>;
  sealSignature: (signature: Blob) => Promise<void>;
  updatePresence: (status: Exclude<PresenceStatus, 'offline'>) => void;
};

const ContractContext = createContext<ContractContextValue | null>(null);

export function ContractProvider({
  initial,
  children,
}: {
  initial: ContractPayload;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    contractReducer,
    initial,
    ({ contract, messages }) => createInitialState(contract, messages),
  );
  const socketRef = useRef<ContractSocket | null>(null);
  const [socket] = useState(createContractSocket);

  useEffect(() => {
    socketRef.current = socket;
    socket.on('connect', () =>
      dispatch({ type: 'connection', status: 'connected' }),
    );
    socket.on('disconnect', () =>
      dispatch({ type: 'connection', status: 'disconnected' }),
    );
    socket.io.on('reconnect_attempt', () =>
      dispatch({ type: 'connection', status: 'reconnecting' }),
    );
    socket.on('presence:state', (presence) =>
      dispatch({ type: 'presence', presence }),
    );
    socket.on('message:new', (message) =>
      dispatch({
        type: 'message',
        message,
        showToast: message.sender !== initial.contract.authenticatedParty,
      }),
    );
    socket.on('contract:sealed', (payload) =>
      dispatch({ type: 'sealed', ...payload }),
    );
    socket.on('contract:finalizing', () => dispatch({ type: 'finalizing' }));
    socket.on('contract:finalized', ({ pdfUrl }) =>
      dispatch({ type: 'finalized', pdfUrl }),
    );
    socket.on('contract:finalization_failed', () =>
      dispatch({ type: 'finalization-failed' }),
    );
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [initial.contract.authenticatedParty, socket]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'dismiss-toast' }),
      4500,
    );
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  const value = useMemo<ContractContextValue>(
    () => ({
      ...state,
      socket,
      updatePresence(status) {
        socketRef.current?.emit('presence:update', { status }, () => undefined);
      },
      sendMessage(body) {
        return new Promise((resolve, reject) => {
          const socket = socketRef.current;
          if (!socket?.connected) {
            reject(new Error('Realtime connection is unavailable.'));
            return;
          }
          socket.emit(
            'message:send',
            { clientId: crypto.randomUUID(), body },
            (result) => {
              if (!result.ok) {
                reject(new Error(result.error.message));
                return;
              }
              if (result.data)
                dispatch({
                  type: 'message',
                  message: result.data,
                  showToast: false,
                });
              resolve();
            },
          );
        });
      },
      async sealSignature(signature) {
        const result = await sealContract(
          state.contract.id,
          signature,
          crypto.randomUUID(),
        );
        dispatch({ type: 'contract', contract: result.contract });
      },
    }),
    [socket, state],
  );

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
}

export function useContract() {
  const context = useContext(ContractContext);
  if (!context)
    throw new Error('useContract must be used within ContractProvider');
  return context;
}
