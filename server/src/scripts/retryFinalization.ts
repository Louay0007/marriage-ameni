import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { createContractRepository } from '../repositories/contracts.js';
import { finalizeContract } from '../services/finalizeContract.js';

const contractId = process.argv[2];
if (!contractId) throw new Error('A contract ID is required.');
const config = loadConfig();
const pool = createPool(config.databaseUrl);
try {
  await finalizeContract(
    contractId,
    config.storageDir,
    createContractRepository(pool),
    {
      sealed: () => undefined,
      finalizing: () => undefined,
      finalized: () => undefined,
      failed: () => undefined,
    },
    config.puppeteerExecutablePath,
  );
} finally {
  await pool.end();
}
