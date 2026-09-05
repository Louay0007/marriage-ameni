import { expect, test, type Page } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const louayUrl = `/c/${id}?key=louay-local-demo-token-0000000000000001`;
const ameniUrl = `/c/${id}?key=ameni-local-demo-token-0000000000000001`;
const guestUrl = `/c/${id}?key=guest-local-demo-token-0000000000000001`;

async function draw(page: Page, label: string) {
  const canvas = page.getByLabel(label);
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Signature canvas was not rendered');
  await page.mouse.move(box.x + 35, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.3, {
    steps: 10,
  });
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.7, {
    steps: 10,
  });
  await page.mouse.up();
}

test('two parties chat, sign live, seal, and download the final PDF', async ({
  browser,
}) => {
  const louayContext = await browser.newContext();
  const ameniContext = await browser.newContext();
  const louay = await louayContext.newPage();
  const ameni = await ameniContext.newPage();
  await Promise.all([louay.goto(louayUrl), ameni.goto(ameniUrl)]);
  await expect(louay.getByText('Signing as').locator('..')).toContainText(
    'Louay',
  );
  await expect(ameni.getByText('Signing as').locator('..')).toContainText(
    'Ameni',
  );
  await expect(louay).not.toHaveURL(/key=/);
  await louay.getByRole('button', { name: 'Open messages' }).click();
  await louay
    .getByRole('textbox', { name: 'Message' })
    .fill('To every ordinary day.');
  await louay.getByRole('button', { name: 'Send message' }).click();
  await expect(ameni.getByText('To every ordinary day.')).toBeVisible();

  await draw(louay, "Louay's editable signature pad");
  await expect
    .poll(() =>
      ameni
        .getByLabel("Louay's read-only signature pad")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL().length),
    )
    .toBeGreaterThan(1000);
  await ameni.reload();
  await expect(
    ameni.getByRole('heading', { name: 'Our Marriage Contract' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      ameni
        .getByLabel("Louay's read-only signature pad")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL().length),
    )
    .toBeGreaterThan(1000);
  louay.once('dialog', (dialog) => dialog.accept());
  await louay.getByRole('button', { name: 'Seal signature' }).click();
  await expect(ameni.getByAltText("Louay's sealed signature")).toBeVisible();

  await draw(ameni, "Ameni's editable signature pad");
  louay.once('dialog', (dialog) => dialog.accept());
  ameni.once('dialog', (dialog) => dialog.accept());
  await ameni.getByRole('button', { name: 'Seal signature' }).click();
  await expect(ameni.getByRole('link', { name: 'Download PDF' })).toBeVisible({
    timeout: 30_000,
  });
  const pdfUrl = await ameni
    .getByRole('link', { name: 'Download PDF' })
    .getAttribute('href');
  const magic = await ameni.evaluate(
    async (url) =>
      String.fromCharCode(
        ...new Uint8Array(await (await fetch(url!)).arrayBuffer()).slice(0, 4),
      ),
    pdfUrl,
  );
  expect(magic).toBe('%PDF');
  await louayContext.close();
  await ameniContext.close();
});

test('guest viewer can observe but cannot mutate the contract', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(guestUrl);
  await expect(page).not.toHaveURL(/key=/);
  await expect(
    page.getByLabel("Louay's read-only signature pad"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ameni's read-only signature pad"),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Seal signature' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Open messages' }).click();
  await page
    .getByRole('textbox', { name: 'Message' })
    .fill('Guests cannot send this.');
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
  await context.close();
});
