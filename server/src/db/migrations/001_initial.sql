CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_a_name text NOT NULL,
  party_b_name text NOT NULL,
  party_a_token_hash text NOT NULL UNIQUE,
  party_b_token_hash text NOT NULL UNIQUE,
  viewer_token_hash text UNIQUE,
  party_a_seal_key uuid,
  party_b_seal_key uuid,
  party_a_signature_path text,
  party_b_signature_path text,
  party_a_sealed_at timestamptz,
  party_b_sealed_at timestamptz,
  finalization_status text NOT NULL DEFAULT 'pending'
    CHECK (finalization_status IN ('pending', 'processing', 'complete', 'failed')),
  finalized_at timestamptz,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((party_a_signature_path IS NULL) = (party_a_sealed_at IS NULL)),
  CHECK ((party_b_signature_path IS NULL) = (party_b_sealed_at IS NULL)),
  CHECK (finalization_status <> 'complete' OR (finalized_at IS NOT NULL AND pdf_path IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('party_a', 'party_b')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  UNIQUE (contract_id, sender, client_id)
);

CREATE INDEX IF NOT EXISTS messages_contract_created_idx
  ON messages (contract_id, created_at, id);