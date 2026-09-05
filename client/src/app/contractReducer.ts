import type {
  ContractView,
  Message,
  Party,
  PresenceStatus,
} from '@marriage/shared';

export type ContractState = {
  contract: ContractView;
  messages: Message[];
  presence: Record<Party, PresenceStatus>;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  toast: Message | null;
};

export type ContractAction =
  | { type: 'contract'; contract: ContractView }
  | { type: 'sealed'; party: Party; sealedAt: string; signatureUrl: string }
  | { type: 'finalizing' }
  | { type: 'finalized'; pdfUrl: string }
  | { type: 'finalization-failed' }
  | { type: 'connection'; status: ContractState['connection'] }
  | { type: 'presence'; presence: Record<Party, PresenceStatus> }
  | { type: 'message'; message: Message; showToast: boolean }
  | { type: 'dismiss-toast' };

export function createInitialState(
  contract: ContractView,
  messages: Message[],
): ContractState {
  return {
    contract,
    messages,
    presence: { party_a: 'offline', party_b: 'offline' },
    connection: 'connecting',
    toast: null,
  };
}

export function contractReducer(
  state: ContractState,
  action: ContractAction,
): ContractState {
  switch (action.type) {
    case 'contract':
      return { ...state, contract: action.contract };
    case 'sealed':
      return {
        ...state,
        contract: {
          ...state.contract,
          ...(action.party === 'party_a'
            ? {
                partyASealedAt: action.sealedAt,
                partyASignatureUrl: action.signatureUrl,
              }
            : {
                partyBSealedAt: action.sealedAt,
                partyBSignatureUrl: action.signatureUrl,
              }),
        },
      };
    case 'finalizing':
      return {
        ...state,
        contract: { ...state.contract, finalizationStatus: 'processing' },
      };
    case 'finalized':
      return {
        ...state,
        contract: {
          ...state.contract,
          finalizationStatus: 'complete',
          pdfUrl: action.pdfUrl,
        },
      };
    case 'finalization-failed':
      return {
        ...state,
        contract: { ...state.contract, finalizationStatus: 'failed' },
      };
    case 'connection':
      return { ...state, connection: action.status };
    case 'presence':
      return { ...state, presence: action.presence };
    case 'message':
      return {
        ...state,
        messages: state.messages.some(({ id }) => id === action.message.id)
          ? state.messages
          : [
              ...state.messages.filter(
                ({ clientId }) => clientId !== action.message.clientId,
              ),
              action.message,
            ],
        toast: action.showToast ? action.message : state.toast,
      };
    case 'dismiss-toast':
      return { ...state, toast: null };
  }
}
