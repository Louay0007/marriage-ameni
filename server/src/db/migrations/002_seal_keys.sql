ALTER TABLE contracts ADD COLUMN IF NOT EXISTS party_a_seal_key uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS party_b_seal_key uuid;