import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContractRow } from '../repositories/contracts.js';
import { exportContractPdf } from './exportPdf.js';

let directory = '';
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('exportContractPdf', () => {
  it('renders a durable PDF with both signatures', async () => {
    directory = await mkdtemp(join(tmpdir(), 'marriage-pdf-'));
    await mkdir(join(directory, 'signatures', 'contract'), { recursive: true });
    const image = new PNG({ width: 100, height: 50 });
    image.data.fill(80);
    const png = PNG.sync.write(image);
    await Promise.all([
      writeFile(join(directory, 'signatures/contract/party_a.png'), png),
      writeFile(join(directory, 'signatures/contract/party_b.png'), png),
    ]);
    const now = new Date();
    const contract: ContractRow = {
      id: 'contract',
      party_a_name: 'Louay',
      party_b_name: 'Ameni',
      party_a_token_hash: 'a',
      party_b_token_hash: 'b',
      viewer_token_hash: null,
      party_a_seal_key: crypto.randomUUID(),
      party_b_seal_key: crypto.randomUUID(),
      party_a_signature_path: 'signatures/contract/party_a.png',
      party_b_signature_path: 'signatures/contract/party_b.png',
      party_a_sealed_at: now,
      party_b_sealed_at: now,
      finalization_status: 'processing',
      finalized_at: null,
      pdf_path: null,
    };
    const relativePath = await exportContractPdf(
      directory,
      contract,
      process.env.PUPPETEER_EXECUTABLE_PATH ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
    const pdf = await readFile(join(directory, relativePath));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(5_000);
  }, 30_000);
});
