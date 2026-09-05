import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { createContractRepository } from '../repositories/contracts.js';
import { fingerprintToken, generateAccessToken } from '../auth/token.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const contracts = createContractRepository(pool);
const partyAToken = generateAccessToken();
const partyBToken = generateAccessToken();
const viewerToken = generateAccessToken();

try {
  const id = await contracts.create({
    partyAName: 'Louay',
    partyBName: 'Ameni',
    partyATokenHash: fingerprintToken(partyAToken, config.tokenPepper),
    partyBTokenHash: fingerprintToken(partyBToken, config.tokenPepper),
    viewerTokenHash: fingerprintToken(viewerToken, config.tokenPepper),
  });
  console.log(`Louay: ${config.publicOrigin}/c/${id}?key=${partyAToken}`);
  console.log(`Ameni: ${config.publicOrigin}/c/${id}?key=${partyBToken}`);
  console.log(`Guest: ${config.publicOrigin}/c/${id}?key=${viewerToken}`);
  console.log('These links are shown once. Store and share them privately.');
} finally {
  await pool.end();
}
