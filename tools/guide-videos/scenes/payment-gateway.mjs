// Turning on a payment gateway (docs/guide/payment-gateways.md).
const SITE = 'mobl-test';
const url = `/api/v1/sites/${SITE}/payment-settings/gateways/zibal`;

/** Puts the studio in the state the video starts from, and back afterwards. */
export const reset = (api) => api('PUT', url, { enabled: false });

export async function play({ page, open, caption, highlight, show, click, type, pause }) {
  await open(`/admin/sites/${SITE}`);
  await pause(500);

  await caption('۱. در منوی کناری، «درگاه‌های پرداخت» را باز کنید');
  await pause(1800);
  await click(page.locator(`a[href$="/sites/${SITE}/payments"]`));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.scrollTo(0, 0));
  await caption('هر درگاه یک کارت دارد');
  await pause(1800);

  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'زیبال' }) });
  await caption('۲. کارت درگاه را پیدا کنید (اینجا: زیبال)');
  await pause(600);
  await show(card);
  await highlight(card);
  await pause(2200);
  await highlight(null);

  await caption('۳. «نمایش در صفحه‌ی پرداخت» را تیک بزنید');
  await click(card.getByText('نمایش در صفحه‌ی پرداخت'));
  await pause(1500);

  await caption('۴. کدی را که درگاه به شما داده وارد کنید');
  await type(card.getByRole('textbox').first(), 'zibal');
  await pause(1500);

  await caption('۵. «ذخیره» را بزنید');
  await click(card.getByRole('button', { name: 'ذخیره' }));
  await pause(1200);
  await show(card);
  await highlight(card.getByRole('heading', { name: 'زیبال' }).locator('..'));
  await caption('✓ برچسب «روشن» شد؛ خریدار حالا این درگاه را در صفحه‌ی پرداخت می‌بیند');
  await pause(3200);
}
