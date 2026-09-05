import { createServer } from 'node:http';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createContractRepository } from './repositories/contracts.js';
import { createMessageRepository } from './repositories/messages.js';
import { registerRoomHandlers } from './sockets/registerRoomHandlers.js';
import type { ContractLifecycle } from './services/finalizeContract.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const contracts = createContractRepository(pool);
const messages = createMessageRepository(pool);
const readiness = async () => {
  await pool.query('SELECT 1');
  await mkdir(config.storageDir, { recursive: true });
  await access(config.storageDir, constants.W_OK);
  return true;
};
const lifecycle: ContractLifecycle = {
  sealed: (id, payload) =>
    io.to(`contract:${id}`).emit('contract:sealed', payload),
  finalizing: (id) =>
    io.to(`contract:${id}`).emit('contract:finalizing', { contractId: id }),
  finalized: (id, payload) =>
    io.to(`contract:${id}`).emit('contract:finalized', payload),
  failed: (id) => io.to(`contract:${id}`).emit('contract:finalization_failed'),
};
const httpServer = createServer(
  createApp(config, contracts, messages, readiness, lifecycle),
);

const io = new Server(httpServer, {
  cors: {
    origin: config.publicOrigin,
    credentials: true,
  },
});
registerRoomHandlers(io, config, contracts, messages);

httpServer.listen(config.port, () => {
  console.log(
    `Marriage contract server listening on http://localhost:${config.port}`,
  );
});

const shutdown = () => {
  io.close();
  httpServer.close(() => void pool.end());
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
