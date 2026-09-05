import type { Message, Party } from '@marriage/shared';
import type { DatabasePool } from '../db/pool.js';

export interface MessageRepository {
  listRecent(contractId: string, limit?: number): Promise<Message[]>;
  create(input: {
    contractId: string;
    sender: Party;
    clientId: string;
    body: string;
  }): Promise<Message>;
}

type MessageRow = {
  id: string;
  client_id: string;
  sender: Party;
  body: string;
  created_at: Date;
  seen_at: Date | null;
};
const mapMessage = (row: MessageRow): Message => ({
  id: row.id,
  clientId: row.client_id,
  sender: row.sender,
  body: row.body,
  createdAt: row.created_at.toISOString(),
  seenAt: row.seen_at?.toISOString() ?? null,
});

export function createMessageRepository(pool: DatabasePool): MessageRepository {
  return {
    async listRecent(contractId, limit = 100) {
      const result = await pool.query<MessageRow>(
        `SELECT id, client_id, sender, body, created_at, seen_at FROM
         (SELECT * FROM messages WHERE contract_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) recent
         ORDER BY created_at, id`,
        [contractId, limit],
      );
      return result.rows.map(mapMessage);
    },
    async create(input) {
      const result = await pool.query<MessageRow>(
        `INSERT INTO messages (contract_id, sender, client_id, body) VALUES ($1, $2, $3, $4)
         ON CONFLICT (contract_id, sender, client_id) DO UPDATE SET body = messages.body
         RETURNING id, client_id, sender, body, created_at, seen_at`,
        [input.contractId, input.sender, input.clientId, input.body],
      );
      return mapMessage(result.rows[0]!);
    },
  };
}
