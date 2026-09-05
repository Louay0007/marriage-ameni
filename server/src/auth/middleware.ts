import type { NextFunction, Request, Response } from 'express';
import { parse } from 'cookie';
import type { Config } from '../config.js';
import {
  SESSION_COOKIE,
  verifySession,
  type SessionIdentity,
} from './session.js';

declare module 'express-serve-static-core' {
  interface Request {
    identity?: SessionIdentity;
  }
}

export function requireSession(config: Config) {
  return (request: Request, response: Response, next: NextFunction) => {
    const identity = verifySession(
      parse(request.headers.cookie ?? '')[SESSION_COOKIE],
      config,
    );
    if (!identity) {
      response.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid private link is required.',
          requestId: response.locals.requestId,
        },
      });
      return;
    }
    request.identity = identity;
    next();
  };
}
