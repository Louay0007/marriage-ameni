import { mkdir, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer';
import type { ContractRow } from '../repositories/contracts.js';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

export async function exportContractPdf(
  storageDir: string,
  contract: ContractRow,
  executablePath?: string,
) {
  if (!contract.party_a_signature_path || !contract.party_b_signature_path)
    throw new Error('SIGNATURES_MISSING');
  const [a, b] = await Promise.all([
    readFile(join(storageDir, contract.party_a_signature_path)),
    readFile(join(storageDir, contract.party_b_signature_path)),
  ]);
  const macChrome =
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browserPath =
    executablePath ?? (existsSync(macChrome) ? macChrome : undefined);
  const browser = await puppeteer.launch({
    headless: true,
    ...(browserPath ? { executablePath: browserPath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('about:'))
        void request.continue();
      else void request.abort();
    });
    await page.setContent(
      `<!doctype html><html><head><style>@page{size:A4;margin:22mm}body{color:#2b2a28;font-family:Georgia,serif}h1{text-align:center;color:#7a1f2b;font-size:34px}h2{text-align:center;font-style:italic}.promise{margin:22px 0;font-size:16px;line-height:1.55}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:55px}.signature{border-top:1px solid #b08d57;padding-top:12px}.signature img{width:100%;height:100px;object-fit:contain}.date{font-size:12px;color:#666}.footer{margin-top:60px;text-align:center;font-size:10px}</style></head><body><h1>Our Marriage Contract</h1><h2>${escapeHtml(contract.party_a_name)} &amp; ${escapeHtml(contract.party_b_name)}</h2><div class="promise">We choose one another freely and wholly, with laughter in the light days and patience in the difficult ones.</div><div class="promise">We promise to make a home where honesty is welcome, kindness is practiced, and neither heart must carry its burdens alone.</div><div class="promise">We will protect time for small joys, and renew this promise with attention, courage, forgiveness, and wonder.</div><div class="signatures"><div class="signature"><img src="data:image/png;base64,${a.toString('base64')}"><strong>${escapeHtml(contract.party_a_name)}</strong><div class="date">${contract.party_a_sealed_at?.toISOString() ?? ''}</div></div><div class="signature"><img src="data:image/png;base64,${b.toString('base64')}"><strong>${escapeHtml(contract.party_b_name)}</strong><div class="date">${contract.party_b_sealed_at?.toISOString() ?? ''}</div></div></div><div class="footer">Ceremonial keepsake · Generated privately</div></body></html>`,
      { waitUntil: 'load' },
    );
    const relativePath = join('pdfs', `${contract.id}.pdf`);
    const finalPath = join(storageDir, relativePath);
    await mkdir(dirname(finalPath), { recursive: true });
    const temporaryPath = `${finalPath}.tmp`;
    await page.pdf({
      path: temporaryPath,
      format: 'A4',
      printBackground: true,
    });
    await rename(temporaryPath, finalPath);
    return relativePath;
  } finally {
    await browser.close();
  }
}
