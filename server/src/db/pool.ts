import pg from 'pg';

export function createPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

export type DatabasePool = ReturnType<typeof createPool>;
