export type Party = 'party_a' | 'party_b';

export type PresenceStatus = 'online' | 'signing' | 'idle' | 'offline';

export type FinalizationStatus =
  'pending' | 'processing' | 'complete' | 'failed';

export type Point = {
  x: number;
  y: number;
  t: number;
  pressure?: number | undefined;
};

export type Stroke = {
  id: string;
  points: Point[];
};

export type StrokeBatch = {
  strokeId: string;
  points: Point[];
  final: boolean;
};

export type ContractView = {
  id: string;
  authenticatedParty: Party;
  readOnly: boolean;
  partyAName: string;
  partyBName: string;
  partyASealedAt: string | null;
  partyBSealedAt: string | null;
  partyASignatureUrl: string | null;
  partyBSignatureUrl: string | null;
  finalizationStatus: FinalizationStatus;
  pdfUrl: string | null;
};

export type Message = {
  id: string;
  clientId: string;
  sender: Party;
  body: string;
  createdAt: string;
  seenAt: string | null;
};

export type ContractPayload = {
  contract: ContractView;
  messages: Message[];
};
