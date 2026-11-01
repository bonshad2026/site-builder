/**
 * Word lists for sample data: Iranian names, cities and streets, and general texts every kind of
 * business can use (reviews, questions, articles, messages). Each entry is { en, fa }.
 */
export type L = { en: string; fa: string };
const L = (en: string, fa: string): L => ({ en, fa });

export const FIRST_NAMES: L[] = [
  L('Sara', 'سارا'), L('Ali', 'علی'), L('Maryam', 'مریم'), L('Reza', 'رضا'), L('Neda', 'ندا'), L('Mohammad', 'محمد'),
  L('Zahra', 'زهرا'), L('Hossein', 'حسین'), L('Fatemeh', 'فاطمه'), L('Amir', 'امیر'), L('Leila', 'لیلا'), L('Mehdi', 'مهدی'),
  L('Nazanin', 'نازنین'), L('Behrouz', 'بهروز'), L('Shirin', 'شیرین'), L('Kaveh', 'کاوه'), L('Parisa', 'پریسا'), L('Saeed', 'سعید'),
  L('Elham', 'الهام'), L('Hamid', 'حمید'), L('Mina', 'مینا'), L('Arash', 'آرش'), L('Narges', 'نرگس'), L('Farhad', 'فرهاد'),
  L('Somayeh', 'سمیه'), L('Pouya', 'پویا'), L('Azadeh', 'آزاده'), L('Babak', 'بابک'), L('Roya', 'رویا'), L('Navid', 'نوید'),
];

export const LAST_NAMES: L[] = [
  L('Mohammadi', 'محمدی'), L('Hosseini', 'حسینی'), L('Karimi', 'کریمی'), L('Ahmadi', 'احمدی'), L('Rezaei', 'رضایی'),
  L('Moradi', 'مرادی'), L('Jafari', 'جعفری'), L('Rahimi', 'رحیمی'), L('Kazemi', 'کاظمی'), L('Sadeghi', 'صادقی'),
  L('Ebrahimi', 'ابراهیمی'), L('Hashemi', 'هاشمی'), L('Nouri', 'نوری'), L('Ghasemi', 'قاسمی'), L('Akbari', 'اکبری'),
  L('Tehrani', 'تهرانی'), L('Shirazi', 'شیرازی'), L('Bagheri', 'باقری'), L('Zamani', 'زمانی'), L('Abbasi', 'عباسی'),
];

export const CITIES: L[] = [
  L('Tehran', 'تهران'), L('Mashhad', 'مشهد'), L('Isfahan', 'اصفهان'), L('Shiraz', 'شیراز'), L('Tabriz', 'تبریز'),
  L('Karaj', 'کرج'), L('Qom', 'قم'), L('Ahvaz', 'اهواز'), L('Rasht', 'رشت'), L('Kerman', 'کرمان'), L('Yazd', 'یزد'), L('Hamedan', 'همدان'),
];

export const STREETS: L[] = [
  L('Valiasr St.', 'خیابان ولیعصر'), L('Enghelab St.', 'خیابان انقلاب'), L('Azadi St.', 'خیابان آزادی'), L('Ferdowsi Sq.', 'میدان فردوسی'),
  L('Shariati St.', 'خیابان شریعتی'), L('Bahar St.', 'خیابان بهار'), L('Golestan Blvd.', 'بلوار گلستان'), L('Saadi St.', 'خیابان سعدی'),
  L('Hafez St.', 'خیابان حافظ'), L('Mellat Blvd.', 'بلوار ملت'),
];

export const ROLES: L[] = [
  L('Customer', 'مشتری'), L('Regular customer', 'مشتری دائمی'), L('Business owner', 'صاحب کسب‌وکار'), L('Teacher', 'معلم'),
  L('Engineer', 'مهندس'), L('Designer', 'طراح'), L('Doctor', 'پزشک'), L('Student', 'دانشجو'), L('Manager', 'مدیر'),
];

export const TESTIMONIALS: L[] = [
  L('Fast delivery and exactly as described. I will order again.', 'ارسال سریع و دقیقاً همان‌طور که توضیح داده بودند. باز هم سفارش می‌دهم.'),
  L('Very polite staff; they answered all my questions patiently.', 'پرسنل بسیار مؤدب؛ با حوصله به همه‌ی سؤال‌هایم جواب دادند.'),
  L('Good quality for the price. Packaging was neat and safe.', 'کیفیت خوب نسبت به قیمت. بسته‌بندی مرتب و مطمئن بود.'),
  L('I tracked my order online the whole way. Great experience.', 'سفارشم را تا رسیدن به‌صورت آنلاین پیگیری کردم. تجربه‌ی عالی بود.'),
  L('They called me the same day and solved the problem.', 'همان روز تماس گرفتند و مشکل را حل کردند.'),
  L('Fair prices and honest advice. Highly recommended.', 'قیمت منصفانه و مشاوره‌ی صادقانه. پیشنهاد می‌کنم.'),
  L('The second time I ordered and again everything was perfect.', 'بار دوم است که سفارش می‌دهم و باز همه‌چیز عالی بود.'),
  L('Booking was easy and they confirmed by SMS within an hour.', 'رزرو راحت بود و ظرف یک ساعت با پیامک تأیید کردند.'),
  L('After-sales service is what sets them apart.', 'خدمات پس از فروش چیزی است که آن‌ها را متمایز می‌کند.'),
  L('A wide range to choose from, and the website is simple to use.', 'تنوع زیاد برای انتخاب و سایتی که کار با آن ساده است.'),
  L('They replaced a damaged item without any argument.', 'کالای آسیب‌دیده را بدون هیچ بحثی تعویض کردند.'),
  L('My go-to shop now; friendly and reliable.', 'حالا فروشگاه همیشگی من است؛ صمیمی و قابل اعتماد.'),
];

export const FAQ: { question: L; answer: L }[] = [
  { question: L('How long does delivery take?', 'ارسال چقدر طول می‌کشد؟'), answer: L('Same or next day in the city, 2–4 working days elsewhere.', 'در شهر همان روز یا روز بعد، و در سایر شهرها ۲ تا ۴ روز کاری.') },
  { question: L('How can I pay?', 'روش‌های پرداخت چیست؟'), answer: L('Online by any Shetab card, or on delivery where available.', 'آنلاین با همه‌ی کارت‌های شتاب، یا در محل در صورت امکان.') },
  { question: L('Can I return or exchange?', 'امکان مرجوعی یا تعویض هست؟'), answer: L('Yes, within 7 days if unused and in its original packaging.', 'بله، تا ۷ روز در صورت استفاده‌نشدن و با بسته‌بندی اصلی.') },
  { question: L('How do I track my order?', 'چطور سفارشم را پیگیری کنم؟'), answer: L('Use the tracking page with your order number and phone, or sign in to your account.', 'از صفحه‌ی پیگیری با شماره سفارش و موبایل، یا با ورود به حساب کاربری.') },
  { question: L('What are your working hours?', 'ساعت کاری شما چیست؟'), answer: L('Saturday to Thursday, 9 am to 8 pm.', 'شنبه تا پنجشنبه، ساعت ۹ تا ۲۰.') },
  { question: L('Do you give an official invoice?', 'فاکتور رسمی می‌دهید؟'), answer: L('Yes, ask for it when ordering and enter your company details.', 'بله، هنگام سفارش درخواست دهید و مشخصات شرکت را وارد کنید.') },
  { question: L('Is there a warranty?', 'گارانتی دارد؟'), answer: L('Products carry the warranty stated on their page.', 'محصولات گارانتی ذکرشده در صفحه‌ی خود را دارند.') },
  { question: L('Is shipping free?', 'ارسال رایگان است؟'), answer: L('Orders above a set amount ship free; the cart shows it.', 'سفارش‌های بالاتر از مبلغ مشخص رایگان ارسال می‌شوند؛ در سبد خرید نمایش داده می‌شود.') },
  { question: L('Can I change my order after placing it?', 'بعد از ثبت می‌توانم سفارش را تغییر دهم؟'), answer: L('Until it is confirmed, yes; send us a message from the order page.', 'تا قبل از تأیید بله؛ از صفحه‌ی سفارش برای ما پیام بفرستید.') },
  { question: L('Do you have a physical store?', 'فروشگاه حضوری دارید؟'), answer: L('Yes, the address and hours are on the contact page.', 'بله، نشانی و ساعت کاری در صفحه‌ی تماس آمده است.') },
  { question: L('How do I get a consultation?', 'چطور مشاوره بگیرم؟'), answer: L('Send the consultation form; an adviser will call you.', 'فرم مشاوره را بفرستید؛ مشاور با شما تماس می‌گیرد.') },
  { question: L('Is my data safe?', 'اطلاعات من امن است؟'), answer: L('We use your details only for your orders and requests.', 'اطلاعات شما فقط برای سفارش‌ها و درخواست‌هایتان استفاده می‌شود.') },
];

export const ARTICLE_TITLES: L[] = [
  L('How to choose the right product for you', 'چطور محصول مناسب خود را انتخاب کنیم'),
  L('Five tips to get more from your purchase', 'پنج نکته برای استفاده‌ی بهتر از خریدتان'),
  L('What is new this season', 'تازه‌های این فصل'),
  L('A guide to care and maintenance', 'راهنمای نگهداری و مراقبت'),
  L('Answers to your most common questions', 'پاسخ به پرسش‌های پرتکرار شما'),
  L('Behind the scenes: how we work', 'پشت صحنه: ما چطور کار می‌کنیم'),
  L('Our new branch is open', 'شعبه‌ی جدید ما افتتاح شد'),
  L('Special offers for loyal customers', 'پیشنهاد ویژه برای مشتریان وفادار'),
  L('Common mistakes and how to avoid them', 'اشتباهات رایج و راه پرهیز از آن‌ها'),
  L('Customer stories', 'داستان مشتریان ما'),
  L('Quality checks before every delivery', 'کنترل کیفیت پیش از هر ارسال'),
  L('Planning ahead for the holidays', 'برنامه‌ریزی برای ایام تعطیلات'),
];

export const PARAGRAPHS: L[] = [
  L('We have prepared this guide based on the questions our customers ask most. Read it before you decide, and contact us if anything is unclear.', 'این راهنما را بر اساس پرتکرارترین پرسش‌های مشتریان آماده کرده‌ایم. پیش از تصمیم آن را بخوانید و اگر نکته‌ای مبهم بود با ما تماس بگیرید.'),
  L('Quality is checked at every step, from buying to packing and delivery. That is why most of our customers come back.', 'کیفیت در همه‌ی مراحل، از خرید تا بسته‌بندی و ارسال، کنترل می‌شود. به همین دلیل بیشتر مشتریان ما دوباره برمی‌گردند.'),
  L('Our team is ready to help on the phone, by message or in person during working hours.', 'تیم ما در ساعت کاری از طریق تلفن، پیام یا حضوری آماده‌ی کمک است.'),
  L('Small details make a big difference: storage, regular care and choosing the right size all matter.', 'جزئیات کوچک تفاوت بزرگی می‌سازند: نگهداری درست، مراقبت منظم و انتخاب اندازه‌ی مناسب همه مهم‌اند.'),
  L('We listen to every suggestion and improve our products and services with your feedback.', 'به همه‌ی پیشنهادها گوش می‌دهیم و محصولات و خدماتمان را با بازخورد شما بهتر می‌کنیم.'),
];

export const CUSTOMER_MESSAGES: L[] = [
  L('Hello, could you tell me when it will be ready?', 'سلام، ممکن است بگویید کی آماده می‌شود؟'),
  L('Thank you, I received it.', 'ممنون، دریافت کردم.'),
  L('Is it possible to change the time?', 'امکان تغییر زمان هست؟'),
  L('Please call me in the afternoon.', 'لطفاً بعدازظهر تماس بگیرید.'),
  L('I sent the payment, please check.', 'پرداخت را انجام دادم، لطفاً بررسی کنید.'),
];

export const STAFF_MESSAGES: L[] = [
  L('Hello, your request is being reviewed. We will call you soon.', 'سلام، درخواست شما در حال بررسی است. به‌زودی تماس می‌گیریم.'),
  L('It is ready; we will send it tomorrow morning.', 'آماده است؛ فردا صبح ارسال می‌کنیم.'),
  L('Thank you for your patience. Everything is arranged.', 'از صبر شما سپاسگزاریم. همه‌چیز هماهنگ شد.'),
  L('Your payment was received.', 'پرداخت شما دریافت شد.'),
];

export const STAFF_NOTES: string[] = ['تماس گرفته شد، مشتری راضی بود.', 'پیگیری مجدد هفته‌ی بعد.', 'مشتری قدیمی؛ تخفیف داده شد.', 'منتظر تأیید انبار.'];

export const VARIANTS: L[] = [
  L('Large', 'سایز بزرگ'), L('Pack of 2', 'بسته‌ی ۲ عددی'), L('Special edition', 'مدل ویژه'), L('New model', 'مدل جدید'),
  L('Economy', 'اقتصادی'), L('Premium', 'پریمیوم'), L('Mini', 'مینی'), L('Family pack', 'بسته‌ی خانواده'),
];

export const TEAM_ROLES: L[] = [
  L('Founder and manager', 'بنیان‌گذار و مدیر'), L('Sales manager', 'مدیر فروش'), L('Customer support', 'پشتیبانی مشتریان'),
  L('Senior adviser', 'مشاور ارشد'), L('Logistics', 'لجستیک و ارسال'), L('Quality control', 'کنترل کیفیت'),
];

export const COURSE_TITLES: L[] = [
  L('Beginner course', 'دوره‌ی مقدماتی'), L('Advanced course', 'دوره‌ی پیشرفته'), L('Weekend workshop', 'کارگاه آخر هفته'),
  L('Professional skills', 'مهارت‌های حرفه‌ای'), L('Hands-on training', 'آموزش عملی'), L('Masterclass', 'مسترکلاس'),
];

export const EVENT_TITLES: L[] = [
  L('Open day', 'روز درهای باز'), L('Product launch', 'رونمایی محصول جدید'), L('Customer meetup', 'دورهمی مشتریان'),
  L('Seasonal sale', 'جشنواره‌ی فروش فصلی'), L('Free seminar', 'سمینار رایگان'), L('Anniversary celebration', 'جشن سالگرد'),
];

export const PROJECT_TITLES: L[] = [
  L('Apartment renovation', 'بازسازی آپارتمان'), L('Office fit-out', 'تجهیز دفتر کار'), L('Café interior', 'طراحی داخلی کافه'),
  L('Villa project', 'پروژه‌ی ویلا'), L('Shop front redesign', 'بازطراحی ویترین فروشگاه'), L('Hotel lobby', 'لابی هتل'),
];
