import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  STORAGE_DIR: z.string().min(1).default('./storage'),
  SESSION_SECRET: z.string().min(32),
  TOKEN_PEPPER: z.string().min(16),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  MAX_SIGNATURE_BYTES: z.coerce.number().int().positive().default(2_097_152),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  publicOrigin: string;
  databaseUrl: string;
  storageDir: string;
  sessionSecret: string;
  tokenPepper: string;
  sessionTtlSeconds: number;
  maxSignatureBytes: number;
  puppeteerExecutablePath?: string | undefined;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  const value = configSchema.parse(environment);
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    publicOrigin: value.PUBLIC_ORIGIN,
    databaseUrl: value.DATABASE_URL,
    storageDir: value.STORAGE_DIR,
    sessionSecret: value.SESSION_SECRET,
    tokenPepper: value.TOKEN_PEPPER,
    sessionTtlSeconds: value.SESSION_TTL_SECONDS,
    maxSignatureBytes: value.MAX_SIGNATURE_BYTES,
    puppeteerExecutablePath: value.PUPPETEER_EXECUTABLE_PATH,
  };
}
