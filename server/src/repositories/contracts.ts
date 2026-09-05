import type { ContractView, Party } from '@marriage/shared';
import type { DatabasePool } from '../db/pool.js';

export type ContractRow = {
  id: string;
  party_a_name: string;
  party_b_name: string;
  party_a_token_hash: string;
  party_b_token_hash: string;
  viewer_token_hash: string | null;
  party_a_seal_key: string | null;
  party_b_seal_key: string | null;
  party_a_sealed_at: Date | null;
  party_b_sealed_at: Date | null;
  party_a_signature_path: string | null;
  party_b_signature_path: string | null;
  finalized_at: Date | null;
  finalization_status: ContractView['finalizationStatus'];
  pdf_path: string | null;
};

export interface ContractRepository {
  findById(id: string): Promise<ContractRow | null>;
  isPartySealed(id: string, party: Party): Promise<boolean>;
  seal(
    id: string,
    party: Party,
    signaturePath: string,
    idempotencyKey: string,
  ): Promise<{ contract: ContractRow; created: boolean }>;
  claimFinalization(id: string): Promise<ContractRow | null>;
  completeFinalization(id: string, pdfPath: string): Promise<ContractRow>;
  failFinalization(id: string): Promise<void>;
  create(input: {
    partyAName: string;
    partyBName: string;
    partyATokenHash: string;
    partyBTokenHash: string;
    viewerTokenHash?: string;
  }): Promise<string>;
}

export function createContractRepository(
  pool: DatabasePool,
): ContractRepository {
  return {
    async findById(id) {
      const result = await pool.query<ContractRow>(
        'SELECT * FROM contracts WHERE id = $1',
        [id],
      );
      return result.rows[0] ?? null;
    },
    async isPartySealed(id, party) {
      const column =
        party === 'party_a' ? 'party_a_sealed_at' : 'party_b_sealed_at';
      const result = await pool.query<{ sealed: boolean }>(
        `SELECT ${column} IS NOT NULL AS sealed FROM contracts WHERE id = $1`,
        [id],
      );
      return result.rows[0]?.sealed ?? true;
    },
    async seal(id, party, signaturePath, idempotencyKey) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query<ContractRow>(
          'SELECT * FROM contracts WHERE id = $1 FOR UPDATE',
          [id],
        );
        const current = locked.rows[0];
        if (!current) throw new Error('NOT_FOUND');
        const alreadySealed =
          party === 'party_a'
            ? current.party_a_sealed_at
            : current.party_b_sealed_at;
        const currentKey =
          party === 'party_a'
            ? current.party_a_seal_key
            : current.party_b_seal_key;
        if (alreadySealed && currentKey === idempotencyKey) {
          await client.query('COMMIT');
          return { contract: current, created: false };
        }
        if (alreadySealed) throw new Error('ALREADY_SEALED');
        const pathColumn =
          party === 'party_a'
            ? 'party_a_signature_path'
            : 'party_b_signature_path';
        const timeColumn =
          party === 'party_a' ? 'party_a_sealed_at' : 'party_b_sealed_at';
        const keyColumn =
          party === 'party_a' ? 'party_a_seal_key' : 'party_b_seal_key';
        const result = await client.query<ContractRow>(
          `UPDATE contracts SET ${pathColumn} = $2, ${timeColumn} = now(), ${keyColumn} = $3, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, signaturePath, idempotencyKey],
        );
        await client.query('COMMIT');
        return { contract: result.rows[0]!, created: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async claimFinalization(id) {
      const result = await pool.query<ContractRow>(
        `UPDATE contracts SET finalization_status = 'processing', updated_at = now()
         WHERE id = $1 AND party_a_sealed_at IS NOT NULL AND party_b_sealed_at IS NOT NULL
           AND finalization_status IN ('pending', 'failed') RETURNING *`,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async completeFinalization(id, pdfPath) {
      const result = await pool.query<ContractRow>(
        `UPDATE contracts SET finalization_status = 'complete', finalized_at = now(), pdf_path = $2, updated_at = now()
         WHERE id = $1 AND finalization_status = 'processing' RETURNING *`,
        [id, pdfPath],
      );
      if (!result.rows[0]) throw new Error('FINALIZATION_NOT_CLAIMED');
      return result.rows[0];
    },
    async failFinalization(id) {
      await pool.query(
        `UPDATE contracts SET finalization_status = 'failed', updated_at = now()
         WHERE id = $1 AND finalization_status = 'processing'`,
        [id],
      );
    },
    async create(input) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO contracts (party_a_name, party_b_name, party_a_token_hash, party_b_token_hash, viewer_token_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          input.partyAName,
          input.partyBName,
          input.partyATokenHash,
          input.partyBTokenHash,
          input.viewerTokenHash ?? null,
        ],
      );
      return result.rows[0]!.id;
    },
  };
}

export function toContractView(
  row: ContractRow,
  authenticatedParty: Party,
  readOnly = false,
): ContractView {
  return {
    id: row.id,
    authenticatedParty,
    readOnly,
    partyAName: row.party_a_name,
    partyBName: row.party_b_name,
    partyASealedAt: row.party_a_sealed_at?.toISOString() ?? null,
    partyBSealedAt: row.party_b_sealed_at?.toISOString() ?? null,
    partyASignatureUrl: row.party_a_signature_path
      ? `/api/contracts/${row.id}/signatures/party_a`
      : null,
    partyBSignatureUrl: row.party_b_signature_path
      ? `/api/contracts/${row.id}/signatures/party_b`
      : null,
    finalizationStatus: row.finalization_status,
    pdfUrl: row.pdf_path ? `/api/contracts/${row.id}/pdf` : null,
  };
}
