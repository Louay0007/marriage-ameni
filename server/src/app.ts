import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Config } from './config.js';
import type { ContractRepository } from './repositories/contracts.js';
import type { MessageRepository } from './repositories/messages.js';
import { authRouter } from './routes/auth.js';
import { contractsRouter } from './routes/contracts.js';
import type { ContractLifecycle } from './services/finalizeContract.js';

export function createApp(
  config: Config,
  contracts: ContractRepository,
  messages: MessageRepository,
  readiness: () => Promise<boolean> = async () => true,
  lifecycle?: ContractLifecycle,
) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.publicOrigin, credentials: true }));
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader('X-Request-Id', response.locals.requestId);
    next();
  });
  app.use(
    pinoHttp({
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.body.token',
      ],
      customProps: (_request: express.Request, response: express.Response) => ({
        requestId: response.locals.requestId,
      }),
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (request, response, next) => {
    if (
      config.nodeEnv === 'production' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== config.publicOrigin
    ) {
      response.status(403).json({
        error: {
          code: 'INVALID_ORIGIN',
          message: 'Request origin was rejected.',
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    next();
  });
  app.get('/api/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.get('/api/health/ready', async (_request, response) => {
    const ready = await readiness().catch(() => false);
    response
      .status(ready ? 200 : 503)
      .json({ status: ready ? 'ready' : 'unavailable' });
  });
  app.use('/api/auth', authRouter(config, contracts));
  app.use(
    '/api/contracts',
    contractsRouter(config, contracts, messages, lifecycle),
  );

  if (config.nodeEnv === 'production') {
    const clientDist = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../client/dist',
    );
    app.use(express.static(clientDist));
    app.get('/{*path}', (_request, response) =>
      response.sendFile(resolve(clientDist, 'index.html')),
    );
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      const tooLarge =
        error instanceof Error &&
        'code' in error &&
        error.code === 'LIMIT_FILE_SIZE';
      response.status(tooLarge ? 413 : 500).json({
        error: {
          code: tooLarge ? 'SIGNATURE_TOO_LARGE' : 'INTERNAL_ERROR',
          message: tooLarge
            ? 'The signature image is too large.'
            : 'An unexpected error occurred.',
          requestId: response.locals.requestId,
        },
      });
    },
  );

  return app;
}
