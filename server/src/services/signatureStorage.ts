import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import type { Party } from '@marriage/shared';

export function validateSignaturePng(buffer: Buffer) {
  let image: PNG;
  try {
    image = PNG.sync.read(buffer);
  } catch {
    throw new Error('INVALID_PNG');
  }
  if (
    image.width < 100 ||
    image.height < 50 ||
    image.width > 4096 ||
    image.height > 2048
  )
    throw new Error('INVALID_DIMENSIONS');
  let inkPixels = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    if ((image.data[index + 3] ?? 0) > 20) inkPixels += 1;
  }
  if (inkPixels < 20) throw new Error('EMPTY_SIGNATURE');
}

export async function storeSignature(
  storageDir: string,
  contractId: string,
  party: Party,
  buffer: Buffer,
) {
  validateSignaturePng(buffer);
  const directory = join(storageDir, 'signatures', contractId);
  await mkdir(directory, { recursive: true });
  const relativePath = join(
    'signatures',
    contractId,
    `${party}-${randomUUID()}.png`,
  );
  const finalPath = join(storageDir, relativePath);
  const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, buffer, { flag: 'wx' });
  await rename(temporaryPath, finalPath);
  return { relativePath, remove: () => rm(finalPath, { force: true }) };
}
