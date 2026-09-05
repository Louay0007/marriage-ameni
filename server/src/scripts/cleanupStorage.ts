import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';

const root = loadConfig().storageDir;
const cutoff = Date.now() - 86_400_000;
async function clean(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await clean(path);
    else if (entry.name.endsWith('.tmp') && (await stat(path)).mtimeMs < cutoff)
      await rm(path, { force: true });
  }
}
await clean(root);
console.log('Stale temporary files removed');
