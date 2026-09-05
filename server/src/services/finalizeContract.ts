import type { ContractRepository } from '../repositories/contracts.js';
import { exportContractPdf } from './exportPdf.js';

export type ContractLifecycle = {
  sealed: (
    contractId: string,
    payload: {
      party: 'party_a' | 'party_b';
      sealedAt: string;
      signatureUrl: string;
    },
  ) => void;
  finalizing: (contractId: string) => void;
  finalized: (
    contractId: string,
    payload: { finalizedAt: string; pdfUrl: string },
  ) => void;
  failed: (contractId: string) => void;
};

export async function finalizeContract(
  contractId: string,
  storageDir: string,
  contracts: ContractRepository,
  lifecycle: ContractLifecycle,
  executablePath?: string,
) {
  const claimed = await contracts.claimFinalization(contractId);
  if (!claimed) return;
  lifecycle.finalizing(contractId);
  try {
    const pdfPath = await exportContractPdf(
      storageDir,
      claimed,
      executablePath,
    );
    const completed = await contracts.completeFinalization(contractId, pdfPath);
    lifecycle.finalized(contractId, {
      finalizedAt: completed.finalized_at!.toISOString(),
      pdfUrl: `/api/contracts/${contractId}/pdf`,
    });
  } catch (error) {
    await contracts.failFinalization(contractId);
    lifecycle.failed(contractId);
    console.error('Contract finalization failed', { contractId, error });
  }
}
