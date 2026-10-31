import { ApiError } from './api';

/**
 * Turns any error (from the API, the network or the browser) into text a person can act on:
 * what went wrong, where, and how to fix it, in Persian or English. The API sends English
 * messages plus the kind of each problem and its limits; everything is translated here.
 */

export type ErrorLanguage = 'fa' | 'en';

export interface ExplainedError {
  /** One sentence: what happened. */
  summary: string;
  /** Each problem: where it is and what to do. */
  items: { where: string; problem: string }[];
  /** What to do next, when there is something general to say. */
  hint?: string;
}

type Pair = { en: string; fa: string };
const P = (en: string, fa: string): Pair => ({ en, fa });

/* ---------- where: path segments ---------- */

const SEGMENTS: Record<string, Pair> = {
  slug: P('Address (slug)', 'آدرس (slug)'),
  title: P('Title', 'عنوان'),
  name: P('Name', 'نام'),
  itemName: P('Name of one item', 'نام یک آیتم'),
  label: P('Name shown', 'نام نمایشی'),
  key: P('Key', 'کلید'),
  fields: P('Field', 'فیلد'),
  options: P('Choice', 'گزینه'),
  value: P('Value', 'مقدار'),
  reference: P('Table it points to', 'جدول مرجع'),
  commerce: P('Selling and booking', 'فروش و ثبت‌نام'),
  priceField: P('Price field', 'فیلد قیمت'),
  discountField: P('Discount field', 'فیلد تخفیف'),
  capacityField: P('Seats field', 'فیلد ظرفیت'),
  deadlineField: P('Deadline field', 'فیلد مهلت'),
  data: P('Values', 'مقادیر'),
  email: P('Email', 'ایمیل'),
  phone: P('Phone', 'تلفن'),
  password: P('Password', 'رمز عبور'),
  message: P('Message', 'پیام'),
  customer: P('Customer', 'مشتری'),
  address: P('Address', 'آدرس'),
  items: P('Item', 'ردیف'),
  quantity: P('Quantity', 'تعداد'),
  price: P('Price', 'قیمت'),
  priceMinor: P('Price', 'قیمت'),
  stock: P('Stock', 'موجودی'),
  description: P('Description', 'توضیحات'),
  category: P('Category', 'دسته'),
  sections: P('Section', 'بخش'),
  props: P('Settings', 'تنظیمات'),
  buttons: P('Button', 'دکمه'),
  href: P('Link', 'لینک'),
  nav: P('Menu item', 'گزینه‌ی منو'),
  children: P('Sub-item', 'زیرمورد'),
  header: P('Header', 'هدر'),
  footer: P('Footer', 'فوتر'),
  columns: P('Column', 'ستون'),
  links: P('Link', 'لینک'),
  social: P('Social link', 'شبکه‌ی اجتماعی'),
  contact: P('Contact details', 'اطلاعات تماس'),
  requestTypes: P('Request type', 'نوع درخواست'),
  productCategories: P('Product category', 'دسته‌ی محصول'),
  cardDesigns: P('Shared box design', 'طرح مشترک باکس'),
  design: P('Design', 'طراحی'),
  filters: P('Filter', 'فیلتر'),
  card: P('Box', 'باکس'),
  document: P('Page content', 'محتوای صفحه'),
  seo: P('SEO', 'سئو'),
  en: P('English', 'انگلیسی'),
  fa: P('Persian', 'فارسی'),
  file: P('File', 'فایل'),
  shop: P('Shop rules', 'قوانین فروشگاه'),
  orderStatuses: P('Order stage', 'مرحله‌ی سفارش'),
  status: P('Status', 'وضعیت'),
  position: P('Order', 'ترتیب'),
  merchantId: P('Merchant id', 'شناسه‌ی پذیرنده'),
};

const digits = (n: number | string, lang: ErrorLanguage) => (lang === 'fa' ? String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]) : String(n));

/** "fields.0.key" → "Field 1 › Key". Unknown keys are shown as they are (e.g. a field's own key). */
export function describePath(path: string, lang: ErrorLanguage): string {
  if (!path) return '';
  const parts = path.split('.');
  const out: string[] = [];
  parts.forEach((part, i) => {
    if (/^\d+$/.test(part)) {
      // A number belongs to the list before it: "Field 1".
      if (out.length && SEGMENTS[parts[i - 1]]) out[out.length - 1] = `${out[out.length - 1]} ${digits(Number(part) + 1, lang)}`;
      else out.push(`#${digits(Number(part) + 1, lang)}`);
      return;
    }
    if (part === 'props' || part === 'body' || part === 'query') return;
    out.push(SEGMENTS[part]?.[lang] ?? `«${part}»`);
  });
  return out.join(' › ');
}

/* ---------- what: known messages ---------- */

/** English messages the API or the shared schemas use, with a Persian version and how to fix. */
const MESSAGES: Record<string, Pair> = {
  // validation summaries
  'Invalid request body': P('Some of the information is missing or not valid:', 'بعضی از اطلاعات ناقص یا نادرست است:'),
  'Invalid query string': P('The request is not valid:', 'درخواست معتبر نیست:'),
  'Invalid path parameters': P('The address is not valid.', 'آدرس معتبر نیست.'),
  'Some values are not valid': P('Some values are not valid:', 'بعضی از مقادیر درست نیست:'),
  'Invalid list query': P('The list settings are not valid:', 'تنظیمات لیست درست نیست:'),
  'Invalid filters': P('The list filters are not valid. Check the section’s filters in the page builder.', 'فیلترهای لیست درست نیست. فیلترهای این بخش را در صفحه‌ساز بررسی کنید.'),
  // schema rules
  Required: P('This is required.', 'این مورد لازم است.'),
  'Use lowercase letters, numbers and single hyphens': P('Use lowercase English letters, numbers and single hyphens (e.g. my-page).', 'فقط حروف کوچک انگلیسی، عدد و خط تیره‌ی تکی (مثلاً my-page).'),
  'Use lowercase English letters, numbers and hyphens': P('Use lowercase English letters, numbers and hyphens.', 'فقط حروف کوچک انگلیسی، عدد و خط تیره.'),
  'Use lowercase English letters, numbers and single hyphens': P('Use lowercase English letters, numbers and single hyphens (e.g. classes).', 'فقط حروف کوچک انگلیسی، عدد و خط تیره‌ی تکی (مثلاً classes).'),
  'Use lowercase English letters, numbers and underscores, starting with a letter': P('Use lowercase English letters, numbers and _, starting with a letter (e.g. start_date).', 'فقط حروف کوچک انگلیسی، عدد و _ ، و با حرف شروع شود (مثلاً start_date).'),
  'Use letters, numbers and single hyphens': P('Use letters, numbers and single hyphens (spaces are not allowed).', 'فقط حروف، عدد و خط تیره‌ی تکی (فاصله مجاز نیست).'),
  'Use a path like /contact or a full https:// link': P('Use a page address like /contact or a full link starting with https://.', 'آدرس صفحه مثل ‎/contact‎ یا لینک کامل که با https://‎ شروع شود بنویسید.'),
  'Use an uploaded image or an https:// URL': P('Choose an uploaded image or a link starting with https://.', 'یک تصویر آپلودشده یا لینکی که با https://‎ شروع شود انتخاب کنید.'),
  'Use a colour like #1f5e4d': P('Use a colour code like #1f5e4d, or leave it empty.', 'کد رنگ مثل ‎#1f5e4d‎ بنویسید یا خالی بگذارید.'),
  'Choose a link': P('Choose a link.', 'یک لینک انتخاب کنید.'),
  'Duplicate field key': P('Two fields have the same key; give each field its own key.', 'دو فیلد کلید یکسان دارند؛ برای هر فیلد کلید جدا بگذارید.'),
  'This key is built in': P('Every item already has a title and an address (slug); use another key.', 'هر آیتم خودش عنوان و آدرس (slug) دارد؛ کلید دیگری بگذارید.'),
  'Every item already has a title and an address (slug); use another key': P('Every item already has a title and an address (slug); use another key (e.g. subtitle).', 'هر آیتم خودش عنوان و آدرس (slug) دارد؛ کلید دیگری بگذارید (مثلاً subtitle).'),
  'Choose the table this field points to': P('Choose the table this field points to.', 'جدولی را که این فیلد به آن اشاره می‌کند انتخاب کنید.'),
  'Choose a price field': P('Choose a field of type Price or Number.', 'یک فیلد از نوع «قیمت» یا «عدد» انتخاب کنید.'),
  'Choose a number field': P('Choose a field of type Number.', 'یک فیلد از نوع «عدد» انتخاب کنید.'),
  'Choose a date field': P('Choose a field of type Date or Date and time.', 'یک فیلد از نوع «تاریخ» یا «تاریخ و ساعت» انتخاب کنید.'),
  'Selling needs a price field': P('To sell items, choose the price field (or turn selling off).', 'برای فروش، فیلد قیمت را انتخاب کنید (یا فروش را خاموش کنید).'),
  'Use a date': P('Enter a date.', 'یک تاریخ وارد کنید.'),
  'Use a date and time': P('Enter a date and a time.', 'تاریخ و ساعت را وارد کنید.'),
  'Not one of the choices': P('Pick one of the choices.', 'یکی از گزینه‌ها را انتخاب کنید.'),
  'Invalid phone number': P('Enter a valid phone number (e.g. 09121234567).', 'شماره تلفن درست وارد کنید (مثلاً 09121234567).'),
  'Invalid email': P('Enter a valid email address (e.g. name@example.com).', 'ایمیل درست وارد کنید (مثلاً name@example.com).'),
  'Invalid uuid': P('Choose an item from the list.', 'یک مورد از فهرست انتخاب کنید.'),
  'Password must be at least 10 characters': P('The password must be at least 10 characters.', 'رمز عبور باید دست‌کم ۱۰ نویسه باشد.'),
  'Password must contain letters and numbers': P('The password must have both letters and numbers.', 'رمز عبور باید هم حرف و هم عدد داشته باشد.'),
  'Duplicate section id': P('Two sections have the same id; duplicate the section again.', 'دو بخش شناسه‌ی یکسان دارند؛ بخش را دوباره تکثیر کنید.'),
  'Each line needs a product or an item': P('A cart line has no product.', 'یکی از ردیف‌های سبد محصول ندارد.'),
  'A box can have at most 80 blocks': P('A box can have at most 80 blocks; remove some.', 'یک باکس حداکثر ۸۰ بلوک می‌تواند داشته باشد؛ چندتا را حذف کنید.'),
  'Rows and columns can be nested at most 6 deep': P('Rows and columns can be nested at most 6 levels deep.', 'ردیف و ستون حداکثر تا ۶ سطح تودرتو می‌شوند.'),
  'Pending, confirmed, fulfilled and cancelled must stay in the list': P('The stages Pending, Confirmed, Fulfilled and Cancelled cannot be removed.', 'مرحله‌های «در انتظار»، «تأییدشده»، «تحویل‌شده» و «لغوشده» را نمی‌شود حذف کرد.'),
  'Use lowercase English letters, numbers and hyphens, starting with a letter or number': P('Use lowercase English letters, numbers and hyphens.', 'فقط حروف کوچک انگلیسی، عدد و خط تیره.'),
  'Use an internal path like /contact': P('Use a page address like /contact.', 'آدرس صفحه مثل ‎/contact‎ بنویسید.'),
  // API messages
  'Account has no email address': P('This account has no email address.', 'این حساب ایمیل ندارد.'),
  'Accounts are created by an administrator': P('Accounts are created by the site administrator.', 'حساب‌ها را مدیر سایت می‌سازد.'),
  'All items in one order must use the same currency': P('Items with different currencies cannot be in one order.', 'آیتم‌هایی با واحد پول متفاوت در یک سفارش قرار نمی‌گیرند.'),
  'An account with this email or phone already exists': P('An account with this email or phone already exists.', 'حسابی با این ایمیل یا تلفن از قبل وجود دارد.'),
  'Attach a file in the "file" field': P('Choose a file to upload.', 'یک فایل برای آپلود انتخاب کنید.'),
  'Choose another home page instead of unsetting this one': P('To change the home page, make another page the home page.', 'برای تغییر صفحه‌ی اصلی، صفحه‌ی دیگری را صفحه‌ی اصلی کنید.'),
  'Enter a valid Zarinpal merchant id (36 characters)': P('Enter a valid Zarinpal merchant id (36 characters).', 'شناسه‌ی پذیرنده‌ی زرین‌پال را درست وارد کنید (۳۶ نویسه).'),
  'Invalid upload fields': P('The upload is not valid.', 'آپلود معتبر نیست.'),
  'Missing or invalid CSRF token': P('Your session has expired. Reload the page and try again.', 'نشست شما منقضی شده است. صفحه را دوباره بارگذاری کنید و دوباره امتحان کنید.'),
  'Only the site operator can change the pages themselves': P('Only the site operator can add, remove or rearrange pages.', 'فقط اپراتور سایت می‌تواند صفحه‌ها را اضافه، حذف یا جابه‌جا کند.'),
  'Only the site operator can change the site structure': P('Only the site operator can change this.', 'فقط اپراتور سایت می‌تواند این را تغییر دهد.'),
  'Only the site owner can do this': P('Only the site owner can do this.', 'فقط صاحب سایت می‌تواند این کار را بکند.'),
  'Only the text and images of a page can be changed': P('You can change only the texts and images of this page.', 'فقط متن‌ها و تصویرهای این صفحه را می‌توانید تغییر دهید.'),
  'Page not found, or it is the home page (which cannot be unpublished)': P('The home page cannot be unpublished.', 'صفحه‌ی اصلی را نمی‌شود از انتشار خارج کرد.'),
  'Payment on delivery is not offered by this shop': P('Payment on delivery is not offered. Choose online payment.', 'پرداخت در محل ارائه نمی‌شود. پرداخت آنلاین را انتخاب کنید.'),
  'Payment reference mismatch': P('The payment could not be matched to the order.', 'پرداخت با سفارش تطبیق داده نشد.'),
  'Please wait before requesting another code': P('Please wait a moment before requesting another code.', 'کمی صبر کنید و بعد دوباره کد بخواهید.'),
  'Referenced record does not exist': P('Something this refers to no longer exists. Choose it again.', 'موردی که به آن اشاره شده دیگر وجود ندارد. دوباره انتخابش کنید.'),
  'Registration for this item has closed': P('Registration for this item has closed.', 'مهلت ثبت‌نام این مورد تمام شده است.'),
  'Site is already active': P('This site is already active.', 'این سایت از قبل فعال است.'),
  'Site is not active': P('This site is not active.', 'این سایت فعال نیست.'),
  'Some items are not available for ordering': P('Some items in your cart can no longer be ordered. Remove them and try again.', 'بعضی از آیتم‌های سبد دیگر قابل سفارش نیستند. آن‌ها را حذف کنید و دوباره امتحان کنید.'),
  'Some products are not available for ordering': P('Some products in your cart can no longer be ordered. Remove them and try again.', 'بعضی از محصولات سبد دیگر قابل سفارش نیستند. آن‌ها را حذف کنید و دوباره امتحان کنید.'),
  'The address (slug) of a table cannot be changed': P('The address (slug) of a table cannot be changed after it is made.', 'آدرس (slug) جدول بعد از ساخت قابل تغییر نیست.'),
  'The code is invalid or has expired': P('The code is wrong or has expired. Request a new code.', 'کد اشتباه است یا منقضی شده. کد جدید بخواهید.'),
  'The home page cannot be deleted': P('The home page cannot be deleted. Make another page the home page first.', 'صفحه‌ی اصلی را نمی‌شود حذف کرد. اول صفحه‌ی دیگری را صفحه‌ی اصلی کنید.'),
  'The test gateway is disabled on this server': P('The test payment gateway is turned off on this server.', 'درگاه پرداخت آزمایشی روی این سرور خاموش است.'),
  'This item is full': P('This item is full.', 'ظرفیت این مورد تکمیل شده است.'),
  'This link is invalid or has expired': P('This link is wrong or has expired. Request a new one.', 'این لینک نادرست است یا منقضی شده. لینک جدید بخواهید.'),
  'This order is already paid': P('This order has already been paid.', 'این سفارش قبلاً پرداخت شده است.'),
  'This order was cancelled': P('This order was cancelled.', 'این سفارش لغو شده است.'),
  'This person is already a member of the site': P('This person is already a member of the site.', 'این شخص از قبل عضو سایت است.'),
  'This phone number belongs to another account': P('This phone number belongs to another account.', 'این شماره تلفن متعلق به حساب دیگری است.'),
  'This site does not sell products': P('This site does not sell products.', 'این سایت محصول نمی‌فروشد.'),
  'Too many wrong codes. Request a new one.': P('Too many wrong codes. Request a new code.', 'کد اشتباه زیاد وارد شد. کد جدید بخواهید.'),
  'Unknown business type': P('Unknown business type.', 'نوع کسب‌وکار ناشناخته است.'),
  'Unknown item': P('This item is not available (it may be unpublished).', 'این مورد در دسترس نیست (شاید منتشر نشده باشد).'),
  'Unknown request type': P('This request type does not exist. Check the request types in the site settings.', 'این نوع درخواست وجود ندارد. انواع درخواست را در تنظیمات سایت بررسی کنید.'),
  'Value violates a constraint': P('One of the values is not allowed.', 'یکی از مقادیر مجاز نیست.'),
  'You cannot change your own status': P('You cannot change your own status.', 'نمی‌توانید وضعیت خودتان را تغییر دهید.'),
  'Invalid email or password': P('The email/username or password is wrong.', 'ایمیل/نام کاربری یا رمز عبور اشتباه است.'),
  'Online payment is not enabled for this site': P('Online payment is not set up for this site.', 'پرداخت آنلاین برای این سایت تنظیم نشده است.'),
  'Payment provider changed; payment cannot be verified': P('The payment gateway was changed, so this payment cannot be checked.', 'درگاه پرداخت تغییر کرده و این پرداخت قابل بررسی نیست.'),
  'Only JPEG, PNG, WebP, AVIF, GIF images and PDF documents are allowed': P('Only JPEG, PNG, WebP, AVIF and GIF images and PDF files can be uploaded.', 'فقط تصویرهای JPEG، PNG، WebP، AVIF و GIF و فایل PDF را می‌شود آپلود کرد.'),
  'Too many failed attempts. Try again later or reset your password.': P('Too many failed attempts. Try again later or reset your password.', 'تلاش ناموفق زیاد بود. کمی بعد دوباره امتحان کنید یا رمز عبور را بازیابی کنید.'),
  'The payment gateway is not responding. Please try again.': P('The payment gateway is not responding. Please try again.', 'درگاه پرداخت پاسخ نمی‌دهد. دوباره امتحان کنید.'),
  'Could not send the code. Please try again.': P('The code could not be sent. Please try again.', 'ارسال کد انجام نشد. دوباره امتحان کنید.'),
  'Request body is not valid JSON': P('The request could not be read. Reload the page and try again.', 'درخواست قابل خواندن نبود. صفحه را دوباره بارگذاری کنید و دوباره امتحان کنید.'),
  'Request body is too large': P('What you sent is too large. Use smaller images or less text.', 'اطلاعات ارسالی بیش از حد بزرگ است. تصویر کوچک‌تر یا متن کمتر استفاده کنید.'),
  'Something went wrong': P('Something went wrong on the server. Try again; if it keeps happening, contact support.', 'در سرور مشکلی پیش آمد. دوباره امتحان کنید؛ اگر تکرار شد با پشتیبانی تماس بگیرید.'),
  'Too many submissions, try again later': P('Too many requests were sent. Wait a few minutes and try again.', 'تعداد درخواست‌ها زیاد بود. چند دقیقه صبر کنید و دوباره امتحان کنید.'),
  'Too many attempts, try again later': P('Too many attempts. Wait a few minutes and try again.', 'تلاش زیاد بود. چند دقیقه صبر کنید و دوباره امتحان کنید.'),
  'Authentication required': P('Your session has ended. Sign in again.', 'نشست شما تمام شده است. دوباره وارد شوید.'),
  'You do not have permission to do this': P('You do not have permission to do this.', 'اجازه‌ی انجام این کار را ندارید.'),
};

/** Things that are "not found" (`<X> not found`). */
const THINGS: Record<string, Pair> = {
  Page: P('page', 'صفحه'),
  'Page version': P('page version', 'نسخه‌ی صفحه'),
  Item: P('item', 'آیتم'),
  Table: P('table', 'جدول'),
  Product: P('product', 'محصول'),
  Service: P('service', 'خدمت'),
  Order: P('order', 'سفارش'),
  Lead: P('request', 'درخواست'),
  File: P('file', 'فایل'),
  Payment: P('payment', 'پرداخت'),
  Site: P('site', 'سایت'),
  'Site settings': P('site settings', 'تنظیمات سایت'),
  'Staff member': P('staff member', 'همکار'),
  User: P('user', 'کاربر'),
  Resource: P('item', 'مورد'),
};

/** Unique constraints → what is already taken. */
const TAKEN: Record<string, Pair> = {
  pages_slug_key: P('A page with this address already exists; choose another address (slug).', 'صفحه‌ای با این آدرس وجود دارد؛ آدرس (slug) دیگری انتخاب کنید.'),
  collections_slug_key: P('A table with this address already exists; choose another address (slug).', 'جدولی با این آدرس وجود دارد؛ آدرس (slug) دیگری انتخاب کنید.'),
  collection_items_collection_id_slug_key: P('Another item of this table has this address; change the address (slug).', 'آیتم دیگری در این جدول همین آدرس را دارد؛ آدرس (slug) را تغییر دهید.'),
  products_slug_key: P('A product with this address already exists; change the address (slug).', 'محصولی با این آدرس وجود دارد؛ آدرس (slug) را تغییر دهید.'),
  services_slug_key: P('A service with this address already exists; change the address (slug).', 'خدمتی با این آدرس وجود دارد؛ آدرس (slug) را تغییر دهید.'),
};

const ALREADY_USED = P('This is already used; choose another value (usually the address/slug).', 'این مقدار قبلاً استفاده شده؛ مقدار دیگری انتخاب کنید (معمولاً آدرس/slug).');

/** Messages with names or numbers in them. */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => Pair][] = [
  [/^(.+) not found$/, (m) => {
    const thing = THINGS[m[1]] ?? P(m[1].toLowerCase(), m[1]);
    return P(`This ${thing.en} was not found (it may have been deleted). Reload the page.`, `این ${thing.fa} پیدا نشد (شاید حذف شده باشد). صفحه را دوباره بارگذاری کنید.`);
  }],
  [/^Only (\d+) seats left for (.+)$/, (m) => P(`Only ${m[1]} seats are left for “${m[2]}”. Lower the quantity.`, `برای «${m[2]}» فقط ${m[1]} جای خالی مانده است. تعداد را کم کنید.`)],
  [/^(.+) is full$/, (m) => P(`“${m[1]}” is full.`, `ظرفیت «${m[1]}» تکمیل شده است.`)],
  [/^Booking for (.+) has closed$/, (m) => P(`Registration for “${m[1]}” has closed.`, `مهلت ثبت‌نام «${m[1]}» تمام شده است.`)],
  [/^(.+) cannot be bought online$/, (m) => P(`“${m[1]}” cannot be bought online.`, `«${m[1]}» قابل خرید آنلاین نیست.`)],
  [/^(.+) has no price$/, (m) => P(`“${m[1]}” has no price yet.`, `«${m[1]}» هنوز قیمت ندارد.`)],
  [/^Quantity of (.+) is limited to (\d+) per order$/, (m) => P(`You can order at most ${m[2]} of “${m[1]}”.`, `از «${m[1]}» حداکثر ${m[2]} عدد در هر سفارش می‌شود سفارش داد.`)],
  [/^An order can have at most (\d+) items$/, (m) => P(`An order can have at most ${m[1]} items.`, `هر سفارش حداکثر ${m[1]} قلم می‌تواند داشته باشد.`)],
  [/^Not enough stock for (.+)$/, (m) => P(`Not enough “${m[1]}” in stock. Lower the quantity.`, `موجودی «${m[1]}» کافی نیست. تعداد را کم کنید.`)],
  [/^Choose a valid colour for (.+)$/, (m) => P(`Choose a colour for “${m[1]}”.`, `برای «${m[1]}» یک رنگ انتخاب کنید.`)],
  [/^Cannot change an order from (\S+) to (\S+)$/, (m) => P(`An order cannot go from “${m[1]}” to “${m[2]}”.`, `سفارش را نمی‌شود از «${m[1]}» به «${m[2]}» برد.`)],
  [/^Requires permission (.+)$/, (m) => P(`You need the “${m[1]}” permission. Ask the site owner.`, `به دسترسی «${m[1]}» نیاز دارید. از صاحب سایت بخواهید.`)],
  [/^The (\w+) module is not enabled for this site$/, (m) => P(`The “${m[1]}” module is off for this site. Turn it on in Settings › Modules.`, `ماژول «${m[1]}» برای این سایت خاموش است. در تنظیمات › ماژول‌ها روشنش کنید.`)],
  [/^Already exists/, () => ALREADY_USED],
  // zod's own wording (values checked without a problem kind, e.g. item fields)
  [/^Expected (\w+), received (\w+)$/, (m) => (m[2] === 'undefined' || m[2] === 'null' ? P('This is required.', 'این مورد لازم است.') : m[1] === 'number' ? P('Enter a number.', 'یک عدد وارد کنید.') : P('This value has the wrong kind.', 'نوع مقدار درست نیست.'))],
  [/^Number must be greater than or equal to (-?[\d.]+)$/, (m) => P(`Must be at least ${m[1]}.`, `مقدار باید دست‌کم ${m[1]} باشد.`)],
  [/^Number must be less than or equal to (-?[\d.]+)$/, (m) => P(`Must be at most ${m[1]}.`, `مقدار باید حداکثر ${m[1]} باشد.`)],
  [/^Expected integer, received float$/, () => P('Enter a whole number (no decimals).', 'عدد صحیح وارد کنید (بدون اعشار).')],
  [/^String must contain at most (\d+) character/, (m) => P(`At most ${m[1]} characters; shorten it.`, `حداکثر ${m[1]} نویسه مجاز است؛ متن را کوتاه کنید.`)],
  [/^String must contain at least (\d+) character/, (m) => P(`Write at least ${m[1]} characters.`, `دست‌کم ${m[1]} نویسه بنویسید.`)],
  [/^Array must contain at most (\d+) element/, (m) => P(`At most ${m[1]} allowed; remove some.`, `حداکثر ${m[1]} مورد مجاز است؛ چندتا را حذف کنید.`)],
  [/^Invalid enum value/, () => P('Choose one of the options in the list.', 'یکی از گزینه‌های فهرست را انتخاب کنید.')],
];

function translateMessage(message: string, lang: ErrorLanguage): string | null {
  const exact = MESSAGES[message] ?? MESSAGES[message.replace(/\.$/, '')];
  if (exact) return exact[lang];
  for (const [re, make] of PATTERNS) {
    const m = message.match(re);
    if (m) return make(m)[lang];
  }
  return null;
}

/* ---------- one validation problem ---------- */

export interface IssueDetail {
  path: string;
  message: string;
  code?: string;
  minimum?: number;
  maximum?: number;
  type?: string;
  validation?: string;
  expected?: string;
  received?: string;
  options?: unknown[];
}

function issueProblem(d: IssueDetail, lang: ErrorLanguage): string {
  const fa = lang === 'fa';
  const n = (x: number | undefined) => digits(x ?? 0, lang);
  switch (d.code) {
    case 'invalid_type':
      if (d.received === 'undefined' || d.received === 'null') return fa ? 'این مورد لازم است.' : 'This is required.';
      if (d.expected === 'number') return fa ? 'یک عدد وارد کنید.' : 'Enter a number.';
      if (d.expected === 'string') return fa ? 'یک متن وارد کنید.' : 'Enter some text.';
      if (d.expected === 'boolean') return fa ? 'بله یا خیر را انتخاب کنید.' : 'Choose yes or no.';
      return fa ? 'نوع مقدار درست نیست.' : 'This value has the wrong kind.';
    case 'too_small':
      if (d.type === 'string') return d.minimum && d.minimum > 1 ? (fa ? `دست‌کم ${n(d.minimum)} نویسه بنویسید.` : `Write at least ${d.minimum} characters.`) : fa ? 'این مورد نباید خالی باشد.' : 'This cannot be empty.';
      if (d.type === 'array') return fa ? `دست‌کم ${n(d.minimum)} مورد لازم است.` : `At least ${d.minimum} needed.`;
      return fa ? `مقدار باید دست‌کم ${n(d.minimum)} باشد.` : `Must be at least ${d.minimum}.`;
    case 'too_big':
      if (d.type === 'string') return fa ? `حداکثر ${n(d.maximum)} نویسه مجاز است؛ متن را کوتاه کنید.` : `At most ${d.maximum} characters; shorten it.`;
      if (d.type === 'array') return fa ? `حداکثر ${n(d.maximum)} مورد مجاز است؛ چندتا را حذف کنید.` : `At most ${d.maximum} allowed; remove some.`;
      return fa ? `مقدار باید حداکثر ${n(d.maximum)} باشد.` : `Must be at most ${d.maximum}.`;
    case 'invalid_string':
      if (d.validation === 'email') return translateMessage('Invalid email', lang)!;
      if (d.validation === 'url') return fa ? 'لینک کامل وارد کنید (با https://‎).' : 'Enter a full link (with https://).';
      if (d.validation === 'uuid') return translateMessage('Invalid uuid', lang)!;
      break;
    case 'invalid_enum_value':
      return fa ? 'یکی از گزینه‌های فهرست را انتخاب کنید.' : 'Choose one of the options in the list.';
    case 'invalid_literal':
      return fa ? 'این گزینه باید تأیید شود.' : 'This must be confirmed.';
  }
  return translateMessage(d.message, lang) ?? d.message;
}

/* ---------- whole error ---------- */

const BY_CODE: Record<string, { summary: Pair; hint?: Pair }> = {
  network_error: { summary: P('The server could not be reached.', 'ارتباط با سرور برقرار نشد.'), hint: P('Check your internet connection and try again.', 'اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.') },
  internal_error: { summary: P('Something went wrong on the server.', 'در سرور مشکلی پیش آمد.'), hint: P('Try again; if it keeps happening, contact support.', 'دوباره امتحان کنید؛ اگر تکرار شد با پشتیبانی تماس بگیرید.') },
  unauthorized: { summary: P('Your session has ended.', 'نشست شما تمام شده است.'), hint: P('Sign in again.', 'دوباره وارد شوید.') },
  forbidden: { summary: P('You do not have permission to do this.', 'اجازه‌ی انجام این کار را ندارید.') },
  rate_limited: { summary: P('Too many attempts.', 'تلاش زیاد بود.'), hint: P('Wait a few minutes and try again.', 'چند دقیقه صبر کنید و دوباره امتحان کنید.') },
  payload_too_large: { summary: P('What you sent is too large.', 'اطلاعات ارسالی بیش از حد بزرگ است.'), hint: P('Use a smaller file or less text.', 'فایل کوچک‌تر یا متن کمتر استفاده کنید.') },
  upload_rejected: { summary: P('The file could not be uploaded.', 'فایل آپلود نشد.'), hint: P('Files must be smaller than the upload limit; try a smaller file.', 'حجم فایل باید کمتر از حد مجاز باشد؛ فایل کوچک‌تری امتحان کنید.') },
};

/**
 * Explains an error for people: a summary, each problem with where it is, and a hint.
 * `labels` names places the caller knows better (e.g. `data.seats` → "Seats").
 */
export function explainError(err: unknown, lang: ErrorLanguage, labels: Record<string, string> = {}): ExplainedError {
  if (!(err instanceof ApiError)) {
    const offline = err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message));
    const known = BY_CODE[offline ? 'network_error' : 'internal_error'];
    return { summary: known.summary[lang], items: [], hint: known.hint?.[lang] };
  }
  const items = (err.details ?? []).map((d) => {
    const path = (d as IssueDetail).path;
    return { where: labels[path] ?? describePath(path, lang), problem: issueProblem(d as IssueDetail, lang) };
  });
  // A taken address: say which one.
  if (err.code === 'conflict' && /^Already exists/.test(err.message)) {
    const constraint = /\((\w+)\)/.exec(err.message)?.[1] ?? '';
    return { summary: (TAKEN[constraint] ?? ALREADY_USED)[lang], items };
  }
  const translated = translateMessage(err.message, lang);
  const byCode = BY_CODE[err.code];
  if (err.code === 'validation_failed' || err.message === 'Some values are not valid')
    return { summary: translated ?? (lang === 'fa' ? 'بعضی از اطلاعات ناقص یا نادرست است:' : 'Some of the information is missing or not valid:'), items, hint: lang === 'fa' ? 'موارد بالا را اصلاح کنید و دوباره ذخیره کنید.' : 'Fix the items above and save again.' };
  return { summary: translated ?? byCode?.summary[lang] ?? err.message, items, hint: byCode?.hint?.[lang] };
}

/** The error as one line (toasts, inline notes). */
export function errorLine(err: unknown, lang: ErrorLanguage): string {
  const e = explainError(err, lang);
  const first = e.items[0];
  const detail = first ? ` ${first.where ? `${first.where}: ` : ''}${first.problem}` : '';
  return `${e.summary}${detail}${e.hint && !first ? ` ${e.hint}` : ''}`.trim();
}
