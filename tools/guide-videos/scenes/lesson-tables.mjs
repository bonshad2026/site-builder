// Screenshots of the "Tables" lesson (docs/guide/learn/tables.md), taken on the sample site 1000.
// Read-only: nothing is saved, so there is no reset.
const SITE = '1000';
const COURSES_PAGE = '4fa3984a-c83d-4f4e-aecd-b85aff327d2e';
const PREVIEW = `http://${SITE}.preview.localhost`;

export async function shots({ page, open, caption, highlight, show, shot, clear, pause }) {
  // 1. Where tables are defined.
  await open(`/admin/sites/${SITE}/tables`);
  const nav = page.locator(`a[href$="/sites/${SITE}/tables"]`);
  await show(nav);
  await highlight(nav);
  await caption('جدول‌ها ← مدیریت جدول‌ها: ساختن جدول و فیلدها');
  await shot('1-manage');
  await clear();

  // 2. The template page of a table.
  const row = page.getByRole('row').filter({ hasText: 'دوره‌ها' });
  await row.getByRole('button', { name: 'ویرایش' }).click();
  const dialog = page.getByRole('dialog');
  const template = dialog.getByText('صفحه‌ی قالب هر آیتم').locator('xpath=ancestor::label[1] | ancestor::div[1]').first();
  await template.scrollIntoViewIfNeeded();
  await highlight(template);
  await caption('ویرایش جدول ← «صفحه‌ی قالب هر آیتم»');
  await shot('2-template');
  await clear();
  await page.keyboard.press('Escape');

  // 3. Adding a "List from a table" section in the builder.
  await open(`/admin/sites/${SITE}/pages/${COURSES_PAGE}/builder`);
  await pause(1500);
  await page.getByRole('button', { name: 'افزودن سکشن' }).click();
  const item = page.getByRole('button', { name: /لیست از جدول/ }).first();
  await item.scrollIntoViewIfNeeded();
  await highlight(item);
  await caption('صفحه‌ساز ← «افزودن سکشن» ← «لیست از جدول»');
  await shot('3-add-section');
  await clear();

  // 4. The settings of the list section.
  await page.getByRole('button', { name: /^سکشن‌ها/ }).click();
  await page.getByRole('button', { name: /لیست از جدول/ }).first().click();
  await pause(1200);
  const box = page.getByText('طراحی باکس').first();
  await box.scrollIntoViewIfNeeded();
  await highlight(box.locator('xpath=ancestor::*[self::section or self::fieldset or self::div][2]'));
  await caption('تنظیمات همین سکشن: منبع، فیلترها، جستجو و «طراحی باکس»');
  await shot('4-list-settings');
  await clear();

  // 5. The list on the site.
  await open(`${PREVIEW}/fa/courses`);
  await pause(1500);
  await caption('نتیجه در سایت: آیتم‌های جدول «دوره‌ها» به‌شکل باکس');
  await shot('5-site-list');
  await clear();

  // 6. One item's own page.
  const first = page.locator('main a[href*="/courses/"]').first();
  await first.click();
  await page.waitForLoadState('networkidle');
  await pause(1500);
  await caption('صفحه‌ی هر آیتم: /courses/<slug>');
  await shot('6-site-item');
}
