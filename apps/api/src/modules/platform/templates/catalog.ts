/**
 * Ready-made starting content for a new site, by kind of business. Photos are Unsplash
 * references (see images.ts); prices are in rials. Everything here is ordinary site content
 * that the operator edits afterwards in the builder.
 */
export type L = { en: string; fa: string };
const L = (en: string, fa: string): L => ({ en, fa });

export interface TemplateProduct {
  slug: string;
  name: L;
  description: L;
  category: string;
  price: number;
  image: string;
  colors?: { name: L; hex: string }[];
  discount?: number;
  stock?: number | null;
  featured?: boolean;
  materials?: L;
  dimensions?: string;
  maxPerOrder?: number;
}

export interface SiteTemplate {
  key: string;
  label: L;
  theme: 'ivory' | 'noir' | 'sage';
  accent: string;
  /** Placeholder colours when photos cannot be downloaded. */
  palette: [string, string];
  tagline: L;
  hero: { eyebrow: L; heading: L; text: L; image: string; cta: L };
  about: { heading: L; body: L; image: string; long: L };
  features: { title: L; text: L }[];
  stats: { value: string; label: L }[];
  catalogLabel: L;
  catalogHeading: L;
  categories: { slug: string; label: L }[];
  products: TemplateProduct[];
  testimonials: { quote: L; name: L; role: L }[];
  faq: { question: L; answer: L }[];
  form: { type: 'contact' | 'consultation' | 'reservation' | 'demo'; navLabel: L; heading: L; intro: L };
  /** Online ordering (cart and checkout) with payment on delivery. */
  orders: boolean;
}

const c = (en: string, fa: string, hex: string) => ({ name: L(en, fa), hex });

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: 'cosmetics',
    label: L('Cosmetics & beauty', 'سایت آرایشی و بهداشتی'),
    theme: 'ivory',
    accent: '#b5838d',
    palette: ['#f3e3e1', '#d8b4b0'],
    tagline: L('Skincare and make-up, chosen with care', 'مراقبت پوست و آرایش، با انتخاب دقیق'),
    hero: {
      eyebrow: L('Beauty · Skincare', 'زیبایی · مراقبت پوست'),
      heading: L('Your skin, at its best', 'بهترین نسخه‌ی پوست شما'),
      text: L('Authentic brands, gentle formulas and honest advice — delivered to your door.', 'برندهای اصل، فرمول‌های ملایم و مشاوره‌ی صادقانه؛ تا درِ منزل شما.'),
      image: 'XYkc3MfT7b4',
      cta: L('Shop now', 'خرید محصولات'),
    },
    about: {
      heading: L('Beauty that respects your skin', 'زیبایی‌ای که به پوست شما احترام می‌گذارد'),
      body: L('Every product we stock is genuine and checked for expiry and storage. Our advisers help you build a routine that suits your skin type.', 'همه‌ی محصولات ما اصل هستند و از نظر تاریخ انقضا و شرایط نگهداری بررسی می‌شوند. مشاوران ما کمک می‌کنند روتینی متناسب با نوع پوستتان بسازید.'),
      image: '1571781926291-c477ebfd024b',
      long: L('We started as a small beauty corner and grew into a trusted shop for skincare and make-up. We buy directly from official distributors, keep products away from heat and light, and never sell anything we would not use ourselves.\n\n- 100% genuine products\n- Free skin consultation\n- Easy returns on unopened items', 'ما از یک غرفه‌ی کوچک زیبایی شروع کردیم و امروز فروشگاهی مطمئن برای محصولات مراقبت پوست و آرایش هستیم. خرید ما مستقیم از نمایندگی‌های رسمی است، محصولات را دور از گرما و نور نگه می‌داریم و چیزی نمی‌فروشیم که خودمان استفاده نکنیم.\n\n- تضمین اصالت ۱۰۰٪\n- مشاوره‌ی رایگان پوست\n- امکان مرجوعی محصولات باز‌نشده'),
    },
    features: [
      { title: L('Guaranteed authentic', 'تضمین اصالت'), text: L('Bought only from official distributors, with batch codes.', 'فقط از نمایندگی‌های رسمی و با کد اصالت.') },
      { title: L('Skin consultation', 'مشاوره‌ی پوست'), text: L('Free advice to choose the right products for you.', 'مشاوره‌ی رایگان برای انتخاب محصول مناسب پوست شما.') },
      { title: L('Fast delivery', 'ارسال سریع'), text: L('Same-day delivery in the city, nationwide in 2–4 days.', 'ارسال همان روز در شهر و ۲ تا ۴ روز به سراسر کشور.') },
    ],
    stats: [
      { value: '+3000', label: L('happy customers', 'مشتری راضی') },
      { value: '+40', label: L('brands', 'برند') },
      { value: '100%', label: L('genuine', 'اصالت') },
    ],
    catalogLabel: L('Shop', 'فروشگاه'),
    catalogHeading: L('Best sellers', 'پرفروش‌ترین‌ها'),
    categories: [
      { slug: 'skincare', label: L('Skincare', 'مراقبت پوست') },
      { slug: 'makeup', label: L('Make-up', 'آرایشی') },
      { slug: 'lips', label: L('Lips', 'لب') },
    ],
    products: [
      { slug: 'hydrating-serum', name: L('Hydrating serum', 'سرم آبرسان'), description: L('Hyaluronic acid serum for all skin types. 30 ml.', 'سرم هیالورونیک اسید مناسب همه‌ی پوست‌ها. ۳۰ میلی‌لیتر.'), category: 'skincare', price: 6_800_000, image: '1571781926291-c477ebfd024b', discount: 15, stock: 24, featured: true },
      { slug: 'daily-sunscreen', name: L('Daily sunscreen SPF50', 'ضدآفتاب روزانه SPF50'), description: L('Light, invisible finish with broad-spectrum protection. 50 ml.', 'بافت سبک و بی‌رنگ با محافظت گسترده. ۵۰ میلی‌لیتر.'), category: 'skincare', price: 5_200_000, image: 'XYkc3MfT7b4', stock: 30, featured: true },
      { slug: 'matte-lipstick', name: L('Matte lipstick', 'رژلب مات'), description: L('Long-wearing matte colour that does not dry the lips.', 'رنگ مات و ماندگار که لب را خشک نمی‌کند.'), category: 'lips', price: 3_900_000, image: 'NnsqpLjiA94', colors: [c('Classic red', 'قرمز کلاسیک', '#b3202b'), c('Nude rose', 'رز نود', '#c98b86'), c('Berry', 'بری', '#7b2245')], featured: true },
      { slug: 'brush-set', name: L('Make-up brush set', 'ست براش آرایشی'), description: L('Seven soft synthetic brushes for face and eyes, with a case.', 'هفت براش نرم مصنوعی برای صورت و چشم، همراه کیف.'), category: 'makeup', price: 7_500_000, image: '1522335789203-aabd1fc54bc9', discount: 10, featured: true },
      { slug: 'foundation', name: L('Satin foundation', 'کرم‌پودر ساتن'), description: L('Medium coverage with a natural satin finish. 30 ml.', 'پوشش متوسط با ظاهر طبیعی و ساتن. ۳۰ میلی‌لیتر.'), category: 'makeup', price: 6_100_000, image: '1596462502278-27bfdc403348', colors: [c('Ivory', 'عاجی', '#efd9c3'), c('Beige', 'بژ', '#d9b48f'), c('Honey', 'عسلی', '#b98454')] },
      { slug: 'night-cream', name: L('Repair night cream', 'کرم شب ترمیم‌کننده'), description: L('Rich cream with ceramides that works while you sleep. 50 ml.', 'کرم غنی با سرامید که هنگام خواب پوست را ترمیم می‌کند. ۵۰ میلی‌لیتر.'), category: 'skincare', price: 7_900_000, image: '1571781926291-c477ebfd024b', stock: 0 },
    ],
    testimonials: [
      { quote: L('Genuine products and honest advice — my skin has never been better.', 'محصولات اصل و مشاوره‌ی صادقانه؛ پوستم هیچ‌وقت این‌قدر خوب نبوده.'), name: L('Sara M.', 'سارا م.'), role: L('Customer', 'مشتری') },
      { quote: L('Ordered in the morning, delivered the same afternoon.', 'صبح سفارش دادم و همان بعدازظهر به دستم رسید.'), name: L('Neda K.', 'ندا ک.'), role: L('Customer', 'مشتری') },
    ],
    faq: [
      { question: L('Are your products genuine?', 'محصولات شما اصل هستند؟'), answer: L('Yes. We buy only from official distributors and every item has a batch code.', 'بله. فقط از نمایندگی‌های رسمی خرید می‌کنیم و هر کالا کد اصالت دارد.') },
      { question: L('Can I return a product?', 'امکان مرجوعی هست؟'), answer: L('Unopened products can be returned within 7 days.', 'محصولات باز‌نشده تا ۷ روز قابل مرجوعی هستند.') },
      { question: L('How do I choose the right product?', 'چطور محصول مناسب را انتخاب کنم؟'), answer: L('Send us a consultation request and our adviser will call you.', 'درخواست مشاوره بفرستید تا مشاور ما با شما تماس بگیرد.') },
    ],
    form: { type: 'contact', navLabel: L('Consultation', 'مشاوره'), heading: L('Free skin consultation', 'مشاوره‌ی رایگان پوست'), intro: L('Tell us about your skin and we will call you back.', 'درباره‌ی پوستتان بگویید تا با شما تماس بگیریم.') },
    orders: true,
  },
  {
    key: 'fastfood',
    label: L('Fast food', 'فست فود'),
    theme: 'noir',
    accent: '#e4572e',
    palette: ['#3b2a22', '#e4572e'],
    tagline: L('Hot, fresh and fast', 'داغ، تازه و سریع'),
    hero: {
      eyebrow: L('Burgers · Pizza · Fries', 'برگر · پیتزا · سیب‌زمینی'),
      heading: L('Made fresh. Delivered hot.', 'تازه درست می‌شود. داغ می‌رسد.'),
      text: L('Hand-pressed burgers, stone-baked pizza and crispy fries — order online in a minute.', 'برگرهای دست‌ساز، پیتزای تنوری و سیب‌زمینی ترد؛ سفارش آنلاین در یک دقیقه.'),
      image: '69J94IO_X3o',
      cta: L('See the menu', 'مشاهده منو'),
    },
    about: {
      heading: L('Fast food, done properly', 'فست فود، اما درست و حسابی'),
      body: L('Fresh meat every morning, our own sauces and a kitchen you can see from the counter.', 'گوشت تازه هر روز صبح، سس‌های مخصوص خودمان و آشپزخانه‌ای که از پشت پیشخوان دیده می‌شود.'),
      image: 'PxJ9zkM2wdA',
      long: L('We opened with one grill and a simple idea: fast food can be fresh. Our patties are pressed by hand every morning, our bread is baked daily and our sauces are made in-house.\n\n- Fresh, never frozen meat\n- Hygiene-certified kitchen\n- Delivery within 45 minutes', 'ما با یک گریل و یک ایده‌ی ساده شروع کردیم: فست فود هم می‌تواند تازه باشد. همبرگرها هر صبح با دست فرم داده می‌شوند، نان روزانه پخت می‌شود و سس‌ها را خودمان درست می‌کنیم.\n\n- گوشت تازه، بدون انجماد\n- آشپزخانه با مجوز بهداشت\n- ارسال زیر ۴۵ دقیقه'),
    },
    features: [
      { title: L('Fresh every day', 'تازه، هر روز'), text: L('Meat and bread prepared each morning.', 'گوشت و نان هر صبح آماده می‌شود.') },
      { title: L('45-minute delivery', 'ارسال ۴۵ دقیقه‌ای'), text: L('Hot to your door, or pay on delivery.', 'داغ تا درِ منزل؛ با امکان پرداخت در محل.') },
      { title: L('House sauces', 'سس‌های مخصوص'), text: L('Recipes you will only find here.', 'دستورهایی که فقط این‌جا پیدا می‌کنید.') },
    ],
    stats: [
      { value: '+500', label: L('orders a day', 'سفارش در روز') },
      { value: '45', label: L('minutes delivery', 'دقیقه تا تحویل') },
      { value: '4.8', label: L('customer rating', 'امتیاز مشتریان') },
    ],
    catalogLabel: L('Menu', 'منو'),
    catalogHeading: L('Today’s favourites', 'محبوب‌های امروز'),
    categories: [
      { slug: 'burgers', label: L('Burgers', 'برگر') },
      { slug: 'pizza', label: L('Pizza', 'پیتزا') },
      { slug: 'sides', label: L('Sides', 'پیش‌غذا') },
    ],
    products: [
      { slug: 'classic-burger', name: L('Classic burger', 'برگر کلاسیک'), description: L('150 g beef, cheddar, lettuce, tomato and house sauce.', '۱۵۰ گرم گوشت گوساله، چدار، کاهو، گوجه و سس مخصوص.'), category: 'burgers', price: 3_200_000, image: 'lsYe-U04H14', featured: true, maxPerOrder: 10 },
      { slug: 'cheese-burger', name: L('Double cheeseburger', 'دابل چیزبرگر'), description: L('Two patties, double cheese and caramelised onions.', 'دو لایه گوشت، پنیر دوبل و پیاز کاراملی.'), category: 'burgers', price: 4_500_000, image: 'BqH1t46q-78', discount: 10, featured: true, maxPerOrder: 10 },
      { slug: 'street-burger', name: L('Street burger', 'برگر خیابانی'), description: L('Smashed patty with pickles and mustard, wrapped to go.', 'گوشت اسمش‌شده با خیارشور و خردل، بسته‌بندی بیرون‌بر.'), category: 'burgers', price: 2_900_000, image: '5nvt9BrLaAc', maxPerOrder: 10 },
      { slug: 'margherita', name: L('Margherita pizza', 'پیتزا مارگاریتا'), description: L('Tomato, mozzarella and basil, stone-baked.', 'گوجه، موزارلا و ریحان؛ پخته در تنور سنگی.'), category: 'pizza', price: 3_800_000, image: '1513104890138-7c749659a591', featured: true, maxPerOrder: 10 },
      { slug: 'fries', name: L('Crispy fries', 'سیب‌زمینی سرخ‌کرده'), description: L('Double-fried, with your choice of sauce.', 'دوبار سرخ‌شده، با سس دلخواه.'), category: 'sides', price: 1_200_000, image: '1573080496219-bb080dd4f877', featured: true, maxPerOrder: 10 },
      { slug: 'burger-combo', name: L('Burger combo', 'کمبو برگر'), description: L('Classic burger, fries and a drink.', 'برگر کلاسیک، سیب‌زمینی و نوشیدنی.'), category: 'burgers', price: 4_400_000, image: 'PxJ9zkM2wdA', discount: 15, maxPerOrder: 10 },
    ],
    testimonials: [
      { quote: L('The best burger in town, and it actually arrives hot.', 'بهترین برگر شهر، و واقعاً داغ می‌رسد.'), name: L('Reza A.', 'رضا ا.'), role: L('Regular', 'مشتری همیشگی') },
      { quote: L('Fries are crispy even after delivery. Impressive.', 'سیب‌زمینی‌ها حتی بعد از ارسال هم تردند. عالی.'), name: L('Mina S.', 'مینا س.'), role: L('Customer', 'مشتری') },
    ],
    faq: [
      { question: L('Do you deliver?', 'ارسال دارید؟'), answer: L('Yes, within 45 minutes in our delivery area.', 'بله، در محدوده‌ی ارسال زیر ۴۵ دقیقه.') },
      { question: L('Can I pay on delivery?', 'امکان پرداخت در محل هست؟'), answer: L('Yes, by card or cash when your order arrives.', 'بله، هنگام تحویل با کارت یا نقدی.') },
      { question: L('Do you have vegetarian options?', 'غذای گیاهی دارید؟'), answer: L('Yes — ask for the veggie patty in any burger.', 'بله؛ در هر برگر می‌توانید گوشت گیاهی سفارش دهید.') },
    ],
    form: { type: 'contact', navLabel: L('Contact', 'تماس'), heading: L('Get in touch', 'تماس با ما'), intro: L('Catering for an event or feedback on your order? Write to us.', 'سفارش برای مراسم یا نظر درباره‌ی سفارشتان؟ برای ما بنویسید.') },
    orders: true,
  },
  {
    key: 'restaurant',
    label: L('Restaurant', 'رستوران'),
    theme: 'noir',
    accent: '#c9a227',
    palette: ['#2a2420', '#7a5c3a'],
    tagline: L('Seasonal cooking, warm hospitality', 'آشپزی فصلی، پذیرایی گرم'),
    hero: {
      eyebrow: L('Restaurant · Since 2012', 'رستوران · از ۱۳۹۱'),
      heading: L('A table worth coming back to', 'میزی که دوباره به آن برمی‌گردید'),
      text: L('Seasonal dishes, a charcoal grill and a dining room made for long evenings.', 'غذاهای فصلی، کباب ذغالی و سالنی برای شب‌های طولانی.'),
      image: '1517248135467-4c7edcad34c4',
      cta: L('Book a table', 'رزرو میز'),
    },
    about: {
      heading: L('Cooking with the seasons', 'آشپزی هم‌گام با فصل‌ها'),
      body: L('Our chefs build the menu around what is fresh at the market, from slow-cooked stews to the grill.', 'سرآشپزهای ما منو را بر اساس مواد تازه‌ی بازار می‌سازند؛ از خورش‌های جاافتاده تا کباب ذغالی.'),
      image: '1414235077428-338989a2e8c0',
      long: L('Our restaurant brings together family recipes and a modern kitchen. We buy fresh produce every morning, cook over charcoal and serve every plate with care.\n\n- Seasonal menu\n- Private dining for up to 40 guests\n- Catering for events', 'رستوران ما دستورهای خانوادگی را با آشپزخانه‌ای امروزی کنار هم می‌آورد. هر صبح مواد تازه می‌خریم، روی ذغال می‌پزیم و هر بشقاب را با دقت سرو می‌کنیم.\n\n- منوی فصلی\n- سالن خصوصی تا ۴۰ نفر\n- پذیرایی مراسم'),
    },
    features: [
      { title: L('Charcoal grill', 'کباب ذغالی'), text: L('Kebabs and steaks cooked over real charcoal.', 'کباب و استیک روی ذغال واقعی.') },
      { title: L('Private dining', 'سالن خصوصی'), text: L('A room for birthdays and business dinners.', 'فضایی برای جشن تولد و شام کاری.') },
      { title: L('Easy reservations', 'رزرو آسان'), text: L('Book online and we confirm by phone.', 'آنلاین رزرو کنید؛ تلفنی تأیید می‌کنیم.') },
    ],
    stats: [
      { value: '12', label: L('years', 'سال سابقه') },
      { value: '120', label: L('seats', 'صندلی') },
      { value: '+40', label: L('dishes', 'نوع غذا') },
    ],
    catalogLabel: L('Menu', 'منو'),
    catalogHeading: L('From our kitchen', 'از آشپزخانه‌ی ما'),
    categories: [
      { slug: 'starters', label: L('Starters', 'پیش‌غذا') },
      { slug: 'mains', label: L('Mains', 'غذای اصلی') },
      { slug: 'grill', label: L('Grill', 'کباب') },
    ],
    products: [
      { slug: 'mixed-grill', name: L('Mixed grill', 'کباب مخلوط'), description: L('Lamb, chicken and kofta over charcoal, with grilled vegetables.', 'بره، مرغ و کوبیده روی ذغال، با سبزیجات کبابی.'), category: 'grill', price: 9_800_000, image: '1555939594-58d7cb561ad1', featured: true },
      { slug: 'slow-ribs', name: L('Slow-cooked ribs', 'دنده‌ی آرام‌پز'), description: L('Six-hour ribs with a smoky glaze.', 'دنده‌ی شش‌ساعته با سس دودی.'), category: 'mains', price: 11_500_000, image: '1544025162-d76694265947', featured: true },
      { slug: 'seasonal-plate', name: L('Chef’s seasonal plate', 'بشقاب فصلی سرآشپز'), description: L('Changes with the market; ask your server.', 'بسته به بازار تغییر می‌کند؛ از گارسون بپرسید.'), category: 'mains', price: 8_900_000, image: '1504674900247-0877df9cc836', featured: true },
      { slug: 'garden-salad', name: L('Garden salad', 'سالاد باغ'), description: L('Leaves, herbs, pomegranate and walnut dressing.', 'سبزیجات برگی، سبزی معطر، انار و سس گردو.'), category: 'starters', price: 3_600_000, image: '1512621776951-a57141f2eefd', featured: true },
      { slug: 'grain-bowl', name: L('Warm grain bowl', 'کاسه‌ی غلات گرم'), description: L('Roasted vegetables, grains and herb yoghurt.', 'سبزیجات کبابی، غلات و ماست سبزیجات.'), category: 'starters', price: 4_200_000, image: '1546069901-ba9599a7e63c' },
    ],
    testimonials: [
      { quote: L('Perfect for family dinners — the grill is outstanding.', 'برای شام خانوادگی عالی است؛ کباب‌ها بی‌نظیرند.'), name: L('Ali R.', 'علی ر.'), role: L('Guest', 'مهمان') },
      { quote: L('We booked the private room for a birthday; flawless service.', 'سالن خصوصی را برای تولد رزرو کردیم؛ پذیرایی بی‌نقص بود.'), name: L('Shirin T.', 'شیرین ت.'), role: L('Guest', 'مهمان') },
    ],
    faq: [
      { question: L('Do I need a reservation?', 'رزرو لازم است؟'), answer: L('Recommended on weekends. Book online and we confirm by phone.', 'آخر هفته‌ها توصیه می‌شود. آنلاین رزرو کنید تا تلفنی تأیید کنیم.') },
      { question: L('Do you host events?', 'مراسم برگزار می‌کنید؟'), answer: L('Yes, our private room seats up to 40 guests.', 'بله، سالن خصوصی ما تا ۴۰ نفر ظرفیت دارد.') },
      { question: L('Is there parking?', 'پارکینگ دارید؟'), answer: L('Valet parking is available every evening.', 'سرویس پارکینگ هر شب فعال است.') },
    ],
    form: { type: 'reservation', navLabel: L('Reservations', 'رزرو میز'), heading: L('Book a table', 'رزرو میز'), intro: L('Choose a date and time; we will confirm by phone.', 'تاریخ و ساعت را انتخاب کنید؛ تلفنی تأیید می‌کنیم.') },
    orders: false,
  },
  {
    key: 'cafe',
    label: L('Coffee shop', 'کافی شاپ'),
    theme: 'ivory',
    accent: '#8c5a3c',
    palette: ['#efe4d6', '#8c5a3c'],
    tagline: L('Specialty coffee and fresh pastries', 'قهوه‌ی تخصصی و شیرینی تازه'),
    hero: {
      eyebrow: L('Coffee · Pastry', 'قهوه · شیرینی'),
      heading: L('Slow mornings, good coffee', 'صبح‌های آرام، قهوه‌ی خوب'),
      text: L('Freshly roasted beans, careful brewing and pastries from our own oven.', 'دانه‌های تازه‌برشته، دم‌آوری دقیق و شیرینی از فِر خودمان.'),
      image: '1554118811-1e0d58224f24',
      cta: L('Reserve a table', 'رزرو میز'),
    },
    about: {
      heading: L('A neighbourhood café', 'یک کافه‌ی محله‌ای'),
      body: L('We roast in small batches every week and bake every morning — come for the coffee, stay for the company.', 'هر هفته در مقدار کم برشته می‌کنیم و هر صبح شیرینی می‌پزیم؛ برای قهوه بیایید و برای حال خوب بمانید.'),
      image: '1501339847302-ac426a4a7cbb',
      long: L('Our café is a quiet place to work, meet and slow down. We source beans from single farms, roast them ourselves and train every barista in-house.\n\n- Weekly roasted beans\n- Pastries baked every morning\n- Free Wi-Fi and quiet corners', 'کافه‌ی ما جایی آرام برای کار، دیدار و کمی آهسته‌تر زندگی کردن است. دانه‌ها را از مزارع مشخص تهیه و خودمان برشته می‌کنیم و همه‌ی باریستاها را خودمان آموزش می‌دهیم.\n\n- برشته‌کاری هفتگی\n- شیرینی تازه هر صبح\n- اینترنت رایگان و گوشه‌های دنج'),
    },
    features: [
      { title: L('Fresh roast', 'برشته‌ی تازه'), text: L('Small batches, roasted every week.', 'مقدار کم، برشته‌شده هر هفته.') },
      { title: L('Baked in-house', 'پخت خانگی'), text: L('Croissants and cakes every morning.', 'کروسان و کیک، هر صبح.') },
      { title: L('Beans to take home', 'دانه برای خانه'), text: L('Order our blends online.', 'ترکیب‌های ما را آنلاین سفارش دهید.') },
    ],
    stats: [
      { value: '6', label: L('single origins', 'تک‌خاستگاه') },
      { value: '7', label: L('days a week', 'روز هفته باز') },
      { value: '+200', label: L('cups a day', 'فنجان در روز') },
    ],
    catalogLabel: L('Menu', 'منو'),
    catalogHeading: L('From the bar', 'از بار قهوه'),
    categories: [
      { slug: 'coffee', label: L('Coffee', 'قهوه') },
      { slug: 'pastry', label: L('Pastry', 'شیرینی') },
      { slug: 'beans', label: L('Beans', 'دانه‌ی قهوه') },
    ],
    products: [
      { slug: 'latte', name: L('Latte', 'لاته'), description: L('Double espresso with silky steamed milk.', 'اسپرسوی دوبل با شیر بخارداده‌ی لطیف.'), category: 'coffee', price: 1_600_000, image: '1461023058943-07fcbe16d735', featured: true },
      { slug: 'espresso', name: L('Espresso', 'اسپرسو'), description: L('Our house blend, chocolatey and balanced.', 'ترکیب مخصوص ما؛ شکلاتی و متعادل.'), category: 'coffee', price: 1_100_000, image: '1509042239860-f550ce710b93', featured: true },
      { slug: 'cappuccino', name: L('Cappuccino', 'کاپوچینو'), description: L('Espresso, milk and a thick layer of foam.', 'اسپرسو، شیر و لایه‌ی ضخیم فوم.'), category: 'coffee', price: 1_500_000, image: '1495474472287-4d71bcdd2085' },
      { slug: 'croissant', name: L('Butter croissant', 'کروسان کره‌ای'), description: L('Baked every morning with real butter.', 'هر صبح با کره‌ی واقعی پخته می‌شود.'), category: 'pastry', price: 900_000, image: '1555507036-ab1f4038808a', featured: true },
      { slug: 'chocolate-cake', name: L('Chocolate cake slice', 'برش کیک شکلاتی'), description: L('Rich layered chocolate cake, baked every morning.', 'کیک شکلاتی لایه‌ای، پخته‌ی هر صبح.'), category: 'pastry', price: 1_400_000, image: '1578985545062-69928b1d9587', featured: true },
      { slug: 'house-blend-250', name: L('House blend beans 250 g', 'دانه‌ی ترکیبی ۲۵۰ گرمی'), description: L('Whole beans, roasted this week.', 'دانه‌ی کامل، برشته‌شده‌ی همین هفته.'), category: 'beans', price: 4_800_000, image: '1509042239860-f550ce710b93', discount: 10, stock: 20 },
    ],
    testimonials: [
      { quote: L('My favourite place to work in the morning — great coffee, calm music.', 'جای مورد علاقه‌ام برای کار صبحگاهی؛ قهوه‌ی عالی و موسیقی آرام.'), name: L('Parisa N.', 'پریسا ن.'), role: L('Regular', 'مشتری همیشگی') },
      { quote: L('The croissants sell out early for a reason.', 'کروسان‌ها بی‌دلیل زود تمام نمی‌شوند.'), name: L('Amir H.', 'امیر ح.'), role: L('Customer', 'مشتری') },
    ],
    faq: [
      { question: L('Can I reserve a table?', 'امکان رزرو میز هست؟'), answer: L('Yes, reserve online for groups or work meetings.', 'بله، برای گروه‌ها یا جلسه‌های کاری آنلاین رزرو کنید.') },
      { question: L('Do you sell beans?', 'دانه‌ی قهوه می‌فروشید؟'), answer: L('Yes, whole or ground, in-store and online.', 'بله، کامل یا آسیاب‌شده، حضوری و آنلاین.') },
      { question: L('Do you have plant milk?', 'شیر گیاهی دارید؟'), answer: L('Oat and almond milk are available for any drink.', 'شیر جو دوسر و بادام برای همه‌ی نوشیدنی‌ها موجود است.') },
    ],
    form: { type: 'reservation', navLabel: L('Reservations', 'رزرو میز'), heading: L('Reserve a table', 'رزرو میز'), intro: L('For groups and meetings — we confirm by phone.', 'برای گروه‌ها و جلسه‌ها؛ تلفنی تأیید می‌کنیم.') },
    orders: true,
  },
  {
    key: 'furniture',
    label: L('Furniture store', 'فروشگاه مبلمان'),
    theme: 'ivory',
    accent: '#8a6a43',
    palette: ['#ece4d8', '#a58a66'],
    tagline: L('Furniture made to live with', 'مبلمانی برای زندگی'),
    hero: {
      eyebrow: L('Sofas · Tables · Lighting', 'مبل · میز · روشنایی'),
      heading: L('Comfort you can see', 'راحتی‌ای که دیده می‌شود'),
      text: L('Sofas, tables and lighting built to last, in fabrics and colours you choose.', 'مبل، میز و روشنایی ماندگار؛ با پارچه و رنگی که خودتان انتخاب می‌کنید.'),
      image: '1618220179428-22790b461013',
      cta: L('Browse the collection', 'مشاهده محصولات'),
    },
    about: {
      heading: L('Made by craftspeople', 'ساخته‌ی دست استادکاران'),
      body: L('Solid wood frames, high-density foam and fabrics tested for daily life — with a five-year warranty.', 'اسکلت چوب طبیعی، فوم با تراکم بالا و پارچه‌هایی که برای استفاده‌ی روزمره آزمایش شده‌اند؛ با ضمانت پنج‌ساله.'),
      image: '1600210492486-724fe5c67fb0',
      long: L('We design and build our furniture with local workshops. Every piece is made to order in the fabric and colour you choose, and delivered and installed by our own team.\n\n- Five-year frame warranty\n- Free delivery and installation in the city\n- Custom sizes on request', 'ما مبلمان را با کارگاه‌های داخلی طراحی و تولید می‌کنیم. هر محصول با پارچه و رنگ انتخابی شما سفارشی ساخته می‌شود و تیم خودمان آن را تحویل و نصب می‌کند.\n\n- ضمانت پنج‌ساله‌ی اسکلت\n- ارسال و نصب رایگان در شهر\n- امکان سفارش در ابعاد دلخواه'),
    },
    features: [
      { title: L('Choose your fabric', 'انتخاب پارچه'), text: L('Over 60 fabrics and colours.', 'بیش از ۶۰ پارچه و رنگ.') },
      { title: L('Five-year warranty', 'ضمانت پنج‌ساله'), text: L('Solid wood frames, built to last.', 'اسکلت چوب طبیعی و ماندگار.') },
      { title: L('Free installation', 'نصب رایگان'), text: L('Delivered and set up by our team.', 'تحویل و چیدمان توسط تیم ما.') },
    ],
    stats: [
      { value: '+15', label: L('years', 'سال تجربه') },
      { value: '+60', label: L('fabrics', 'پارچه') },
      { value: '5', label: L('year warranty', 'سال ضمانت') },
    ],
    catalogLabel: L('Products', 'محصولات'),
    catalogHeading: L('Featured pieces', 'محصولات منتخب'),
    categories: [
      { slug: 'sofas', label: L('Sofas', 'مبل') },
      { slug: 'tables', label: L('Tables', 'میز') },
      { slug: 'lighting', label: L('Lighting', 'روشنایی') },
    ],
    products: [
      { slug: 'velvet-sofa', name: L('Velvet three-seat sofa', 'مبل سه‌نفره مخمل'), description: L('Deep seat, solid wood legs, velvet upholstery.', 'نشیمن عمیق، پایه‌ی چوب طبیعی و رویه‌ی مخمل.'), category: 'sofas', price: 420_000_000, image: '1555041469-a586c61ea9bc', colors: [c('Emerald', 'سبز زمردی', '#1f5e4d'), c('Sand', 'شنی', '#c8b59a'), c('Navy', 'سرمه‌ای', '#22314d')], featured: true, materials: L('Velvet, oak', 'مخمل، بلوط'), dimensions: '220 × 95 × 80 cm' },
      { slug: 'lounge-chair', name: L('Lounge chair', 'صندلی راحتی'), description: L('A compact armchair for reading corners.', 'مبل تک جمع‌وجور برای گوشه‌ی مطالعه.'), category: 'sofas', price: 145_000_000, image: '1567016432779-094069958ea5', colors: [c('Terracotta', 'آجری', '#b5573a'), c('Ivory', 'عاجی', '#efe8da')], discount: 10, featured: true },
      { slug: 'dining-table', name: L('Oak dining table', 'میز ناهارخوری بلوط'), description: L('Six-seat table in solid oak.', 'میز شش‌نفره از چوب بلوط طبیعی.'), category: 'tables', price: 260_000_000, image: '1617806118233-18e1de247200', featured: true, dimensions: '180 × 90 × 75 cm' },
      { slug: 'floor-lamp', name: L('Floor lamp', 'آباژور ایستاده'), description: L('Adjustable metal shade in matte grey.', 'کلاهک فلزی قابل تنظیم با رنگ خاکستری مات.'), category: 'lighting', price: 38_000_000, image: '1507473885765-e6ed057f782c', featured: true },
      { slug: 'coffee-table', name: L('Round coffee table', 'میز جلومبلی گرد'), description: L('Walnut veneer with a hidden shelf.', 'روکش گردو با طبقه‌ی پنهان.'), category: 'tables', price: 85_000_000, image: '1533090481720-856c6e3c1fdc', stock: 0 },
    ],
    testimonials: [
      { quote: L('The sofa arrived exactly in the fabric we picked — beautifully made.', 'مبل دقیقاً با پارچه‌ای که انتخاب کرده بودیم رسید؛ ساخت فوق‌العاده.'), name: L('Hamed P.', 'حامد پ.'), role: L('Customer', 'مشتری') },
      { quote: L('Delivery and installation were quick and tidy.', 'ارسال و نصب سریع و تمیز انجام شد.'), name: L('Leila F.', 'لیلا ف.'), role: L('Customer', 'مشتری') },
    ],
    faq: [
      { question: L('Can I choose the fabric?', 'امکان انتخاب پارچه هست؟'), answer: L('Yes, from more than 60 fabrics in our showroom or by sample.', 'بله، از بیش از ۶۰ پارچه در نمایشگاه یا با نمونه.') },
      { question: L('How long does an order take?', 'زمان ساخت چقدر است؟'), answer: L('Usually three to four weeks.', 'معمولاً سه تا چهار هفته.') },
      { question: L('Do you deliver outside the city?', 'به شهرستان ارسال دارید؟'), answer: L('Yes, nationwide with insured transport.', 'بله، به سراسر کشور با حمل بیمه‌شده.') },
    ],
    form: { type: 'consultation', navLabel: L('Consultation', 'مشاوره'), heading: L('Design consultation', 'مشاوره‌ی چیدمان'), intro: L('Tell us about your space and we will suggest the right pieces.', 'درباره‌ی فضای خود بگویید تا محصولات مناسب را پیشنهاد دهیم.') },
    orders: true,
  },
  {
    key: 'appliances',
    label: L('Home appliances store', 'فروشگاه لوازم خانگی'),
    theme: 'sage',
    accent: '#2f6f8f',
    palette: ['#e3ecef', '#7fa3b3'],
    tagline: L('Appliances with warranty and installation', 'لوازم خانگی با گارانتی و نصب'),
    hero: {
      eyebrow: L('Kitchen · Laundry · Cooling', 'آشپزخانه · شست‌وشو · سرمایش'),
      heading: L('Everything your home runs on', 'هر آنچه خانه‌ی شما به آن نیاز دارد'),
      text: L('Genuine appliances with official warranty, free delivery and installation.', 'لوازم خانگی اصل با گارانتی رسمی، ارسال و نصب رایگان.'),
      image: 'E2XW7BvfRQg',
      cta: L('Shop appliances', 'خرید لوازم خانگی'),
    },
    about: {
      heading: L('Service after the sale', 'خدمات پس از فروش واقعی'),
      body: L('We install every large appliance and handle warranty claims for you.', 'همه‌ی لوازم بزرگ را نصب می‌کنیم و پیگیری گارانتی را خودمان انجام می‌دهیم.'),
      image: 'HiQxzJy1e8w',
      long: L('For over a decade we have helped families choose the right appliances. We only sell products with official warranty and our technicians install and check every large appliance.\n\n- Official warranty on every product\n- Free delivery and installation\n- Instalment payment options', 'بیش از یک دهه است که به خانواده‌ها در انتخاب لوازم خانگی مناسب کمک می‌کنیم. فقط کالای دارای گارانتی رسمی می‌فروشیم و تکنسین‌های ما همه‌ی لوازم بزرگ را نصب و بررسی می‌کنند.\n\n- گارانتی رسمی برای همه‌ی کالاها\n- ارسال و نصب رایگان\n- امکان خرید اقساطی'),
    },
    features: [
      { title: L('Official warranty', 'گارانتی رسمی'), text: L('Every product, every brand.', 'برای همه‌ی محصولات و برندها.') },
      { title: L('Free installation', 'نصب رایگان'), text: L('By certified technicians.', 'توسط تکنسین‌های مجرب.') },
      { title: L('Pay on delivery', 'پرداخت در محل'), text: L('Pay when your appliance is installed.', 'پس از نصب کالا پرداخت کنید.') },
    ],
    stats: [
      { value: '+10', label: L('years', 'سال سابقه') },
      { value: '+25', label: L('brands', 'برند') },
      { value: '24h', label: L('installation', 'نصب') },
    ],
    catalogLabel: L('Products', 'محصولات'),
    catalogHeading: L('Popular appliances', 'پرطرفدارترین‌ها'),
    categories: [
      { slug: 'laundry', label: L('Laundry', 'شست‌وشو') },
      { slug: 'cooling', label: L('Refrigerators', 'یخچال و فریزر') },
      { slug: 'kitchen', label: L('Kitchen', 'آشپزخانه') },
    ],
    products: [
      { slug: 'front-load-washer', name: L('Front-load washing machine 8 kg', 'ماشین لباسشویی ۸ کیلویی درب از جلو'), description: L('Inverter motor, 15 programmes, A+++ energy rating.', 'موتور اینورتر، ۱۵ برنامه، رده‌ی انرژی A+++.'), category: 'laundry', price: 420_000_000, image: '5cpBWEl6y6c', colors: [c('White', 'سفید', '#f4f4f2'), c('Silver', 'نقره‌ای', '#b9bcbf')], featured: true, stock: 8 },
      { slug: 'washer-dryer', name: L('Washer-dryer 9 kg', 'لباسشویی و خشک‌کن ۹ کیلویی'), description: L('Wash and dry in one cycle; steam refresh.', 'شست‌وشو و خشک‌کردن در یک چرخه؛ با بخار.'), category: 'laundry', price: 560_000_000, image: 'EXCroywwrEw', discount: 8, featured: true, stock: 4 },
      { slug: 'side-by-side-fridge', name: L('Side-by-side refrigerator', 'یخچال ساید بای ساید'), description: L('No-frost, water dispenser, 600 litres.', 'نوفراست، آبسردکن، ۶۰۰ لیتر.'), category: 'cooling', price: 980_000_000, image: 'HiQxzJy1e8w', colors: [c('Stainless', 'استیل', '#a7a9ac'), c('Black', 'مشکی', '#1d1d1f')], featured: true, stock: 3 },
      { slug: 'fridge-freezer', name: L('Fridge-freezer', 'یخچال فریزر'), description: L('Bottom freezer, 400 litres, quiet compressor.', 'فریزر پایین، ۴۰۰ لیتر، کمپرسور کم‌صدا.'), category: 'cooling', price: 510_000_000, image: '68B1sZXm7Uc', featured: true, stock: 6 },
      { slug: 'dishwasher', name: L('Dishwasher 14 place', 'ماشین ظرفشویی ۱۴ نفره'), description: L('Six programmes, half-load and delayed start.', 'شش برنامه، نیم‌بار و شروع با تأخیر.'), category: 'kitchen', price: 380_000_000, image: 'CwnPmtA2NHc', stock: 0 },
    ],
    testimonials: [
      { quote: L('Installed the same day and the technician explained everything.', 'همان روز نصب شد و تکنسین همه‌چیز را توضیح داد.'), name: L('Mohsen D.', 'محسن د.'), role: L('Customer', 'مشتری') },
      { quote: L('Genuine warranty and a fair price. Will buy again.', 'گارانتی واقعی و قیمت منصفانه. دوباره خرید می‌کنم.'), name: L('Zahra G.', 'زهرا ق.'), role: L('Customer', 'مشتری') },
    ],
    faq: [
      { question: L('Is installation free?', 'نصب رایگان است؟'), answer: L('Yes, for all large appliances in our service area.', 'بله، برای همه‌ی لوازم بزرگ در محدوده‌ی خدمات.') },
      { question: L('Can I pay in instalments?', 'خرید اقساطی دارید؟'), answer: L('Yes, ask our sales team for the current plans.', 'بله، شرایط فعلی را از کارشناسان فروش بپرسید.') },
      { question: L('Which warranty do products have?', 'محصولات چه گارانتی‌ای دارند؟'), answer: L('Each product has its official brand warranty, usually 18–24 months.', 'هر کالا گارانتی رسمی برند خود را دارد؛ معمولاً ۱۸ تا ۲۴ ماه.') },
    ],
    form: { type: 'contact', navLabel: L('Buying advice', 'مشاوره‌ی خرید'), heading: L('Free buying advice', 'مشاوره‌ی رایگان خرید'), intro: L('Not sure which model fits your home? We will call you.', 'نمی‌دانید کدام مدل مناسب خانه‌ی شماست؟ با شما تماس می‌گیریم.') },
    orders: true,
  },
  {
    key: 'plastics',
    label: L('Plastic goods store', 'فروشگاه لوازم پلاستیکی'),
    theme: 'sage',
    accent: '#3a8f6b',
    palette: ['#e4f0ea', '#86b9a1'],
    tagline: L('Durable, food-safe plastic goods', 'لوازم پلاستیکی بادوام و بهداشتی'),
    hero: {
      eyebrow: L('Storage · Kitchen · Home', 'نگهداری · آشپزخانه · خانه'),
      heading: L('Order in every corner', 'نظم در هر گوشه‌ی خانه'),
      text: L('Food-safe containers, storage boxes and household plastics — retail and wholesale.', 'ظروف بهداشتی، باکس‌های نگهداری و لوازم پلاستیکی خانه؛ تک و عمده.'),
      image: 'LZse1GUiPdo',
      cta: L('See products', 'مشاهده محصولات'),
    },
    about: {
      heading: L('Quality you can trust with food', 'کیفیتی که به آن اعتماد دارید'),
      body: L('Our containers are made from BPA-free, food-grade plastic and tested for daily use.', 'ظروف ما از پلاستیک خوراکی و بدون BPA ساخته و برای استفاده‌ی روزانه آزمایش شده‌اند.'),
      image: '8rwJ94EffhY',
      long: L('We supply homes, restaurants and shops with household plastic goods. Everything we sell is made from food-grade, BPA-free materials and comes in a range of colours and sizes.\n\n- Food-grade, BPA-free\n- Retail and wholesale prices\n- Nationwide delivery', 'ما لوازم پلاستیکی خانگی را برای خانه‌ها، رستوران‌ها و فروشگاه‌ها تأمین می‌کنیم. همه‌ی کالاها از مواد خوراکی و بدون BPA ساخته شده‌اند و در رنگ‌ها و اندازه‌های مختلف عرضه می‌شوند.\n\n- مواد خوراکی و بدون BPA\n- فروش تک و عمده\n- ارسال به سراسر کشور'),
    },
    features: [
      { title: L('Food-grade', 'مواد خوراکی'), text: L('BPA-free and safe for food.', 'بدون BPA و ایمن برای مواد غذایی.') },
      { title: L('Wholesale prices', 'قیمت عمده'), text: L('Better prices for bulk orders.', 'قیمت ویژه برای خرید عمده.') },
      { title: L('Many colours', 'رنگ‌بندی متنوع'), text: L('Every product in several colours.', 'هر محصول در چند رنگ.') },
    ],
    stats: [
      { value: '+300', label: L('products', 'محصول') },
      { value: '+1200', label: L('shops supplied', 'فروشگاه همکار') },
      { value: '0%', label: L('BPA', 'BPA') },
    ],
    catalogLabel: L('Products', 'محصولات'),
    catalogHeading: L('Best sellers', 'پرفروش‌ها'),
    categories: [
      { slug: 'storage', label: L('Storage', 'نگهداری') },
      { slug: 'kitchen', label: L('Kitchen', 'آشپزخانه') },
      { slug: 'household', label: L('Household', 'خانگی') },
    ],
    products: [
      { slug: 'storage-box-40l', name: L('Storage box 40 L', 'باکس نگهداری ۴۰ لیتری'), description: L('Stackable box with clip lid.', 'باکس قابل چیدن روی هم با درب قفل‌شو.'), category: 'storage', price: 4_500_000, image: 'XDIeOJHMC8A', colors: [c('Black', 'مشکی', '#1f1f1f'), c('Clear', 'شفاف', '#e8eef0'), c('Grey', 'طوسی', '#8a8f93')], featured: true },
      { slug: 'food-container-set', name: L('Food container set (5 pcs)', 'ست ظرف غذا ۵ عددی'), description: L('Microwave and freezer safe, airtight lids.', 'مناسب مایکروویو و فریزر، درب کاملاً بسته.'), category: 'kitchen', price: 3_200_000, image: 'AEU9UZstCfs', colors: [c('Pink', 'صورتی', '#f2a7b5'), c('Green', 'سبز', '#7cc39a')], discount: 12, featured: true },
      { slug: 'mixing-bowls', name: L('Mixing bowls set', 'ست کاسه‌ی آشپزخانه'), description: L('Three nesting bowls in bright colours.', 'سه کاسه‌ی تودرتو با رنگ‌های شاد.'), category: 'kitchen', price: 1_900_000, image: '8rwJ94EffhY', featured: true },
      { slug: 'fridge-organisers', name: L('Fridge organisers', 'نظم‌دهنده‌ی یخچال'), description: L('Clear bins that keep produce visible.', 'باکس‌های شفاف که مواد غذایی را در دید نگه می‌دارند.'), category: 'storage', price: 2_600_000, image: 'LZse1GUiPdo', featured: true },
      { slug: 'utility-bins', name: L('Utility bins', 'سطل چندمنظوره'), description: L('Sturdy bins for home, shop and workshop.', 'سطل‌های محکم برای خانه، مغازه و کارگاه.'), category: 'household', price: 1_500_000, image: 'FoVgLfLHcng', colors: [c('Blue', 'آبی', '#2f6fb3'), c('Red', 'قرمز', '#c23b33'), c('Green', 'سبز', '#3a8f6b')] },
    ],
    testimonials: [
      { quote: L('Solid quality and the colours are exactly as pictured.', 'کیفیت عالی و رنگ‌ها دقیقاً مثل عکس.'), name: L('Fatemeh J.', 'فاطمه ج.'), role: L('Customer', 'مشتری') },
      { quote: L('We restock our shop here every month — reliable delivery.', 'هر ماه مغازه‌مان را از این‌جا تأمین می‌کنیم؛ ارسال مطمئن.'), name: L('Kaveh B.', 'کاوه ب.'), role: L('Shop owner', 'فروشنده') },
    ],
    faq: [
      { question: L('Are the products food-safe?', 'محصولات بهداشتی هستند؟'), answer: L('Yes, food-grade and BPA-free.', 'بله، از مواد خوراکی و بدون BPA.') },
      { question: L('Do you sell wholesale?', 'فروش عمده دارید؟'), answer: L('Yes — send a request for a wholesale price list.', 'بله؛ برای دریافت لیست قیمت عمده درخواست بفرستید.') },
      { question: L('How long is delivery?', 'ارسال چقدر طول می‌کشد؟'), answer: L('Two to four working days nationwide.', 'دو تا چهار روز کاری به سراسر کشور.') },
    ],
    form: { type: 'contact', navLabel: L('Wholesale', 'خرید عمده'), heading: L('Wholesale enquiries', 'درخواست خرید عمده'), intro: L('Tell us what you need and we will send a price list.', 'نیازتان را بنویسید تا لیست قیمت را برایتان بفرستیم.') },
    orders: true,
  },
  {
    key: 'disposables',
    label: L('Disposable tableware distributor', 'شرکت توزیع ظروف یک‌بار مصرف'),
    theme: 'sage',
    accent: '#a0763a',
    palette: ['#f1ead9', '#c2a36b'],
    tagline: L('Disposable tableware for restaurants, cafés and events', 'ظروف یک‌بار مصرف برای رستوران، کافه و مراسم'),
    hero: {
      eyebrow: L('Wholesale · Distribution', 'عمده‌فروشی · توزیع'),
      heading: L('Supplies that keep your kitchen moving', 'تأمین مطمئن برای آشپزخانه‌ی شما'),
      text: L('Cups, containers, cutlery and packaging — delivered on schedule to businesses across the country.', 'لیوان، ظرف، قاشق‌چنگال و بسته‌بندی؛ تحویل به‌موقع به کسب‌وکارها در سراسر کشور.'),
      image: 'LZse1GUiPdo',
      cta: L('Request a quote', 'درخواست پیش‌فاکتور'),
    },
    about: {
      heading: L('A reliable supply partner', 'شریک تأمین قابل اعتماد'),
      body: L('We distribute disposable tableware from certified manufacturers, with stock ready in our warehouse.', 'ظروف یک‌بار مصرف را از تولیدکنندگان دارای مجوز توزیع می‌کنیم و موجودی آماده در انبار داریم.'),
      image: 'XDIeOJHMC8A',
      long: L('We supply restaurants, cafés, caterers and shops with everything they serve in. Our warehouse keeps stock ready, so orders ship within 48 hours.\n\n- Health-certified products\n- Eco-friendly paper options\n- Fixed delivery days for regular customers', 'ما رستوران‌ها، کافه‌ها، تشریفات و فروشگاه‌ها را با همه‌ی ظروف مورد نیاز تأمین می‌کنیم. موجودی انبار ما همیشه آماده است و سفارش‌ها ظرف ۴۸ ساعت ارسال می‌شوند.\n\n- محصولات دارای مجوز بهداشت\n- گزینه‌های کاغذی و دوستدار محیط زیست\n- روزهای ثابت تحویل برای مشتریان دائمی'),
    },
    features: [
      { title: L('Ready stock', 'موجودی آماده'), text: L('Orders ship within 48 hours.', 'ارسال سفارش‌ها ظرف ۴۸ ساعت.') },
      { title: L('Business pricing', 'قیمت همکاری'), text: L('Tiered prices for bulk orders.', 'قیمت پلکانی برای سفارش عمده.') },
      { title: L('Eco options', 'گزینه‌های سبز'), text: L('Paper and biodegradable lines.', 'محصولات کاغذی و تجزیه‌پذیر.') },
    ],
    stats: [
      { value: '+800', label: L('business customers', 'مشتری تجاری') },
      { value: '48h', label: L('shipping', 'ارسال') },
      { value: '+150', label: L('products', 'محصول') },
    ],
    catalogLabel: L('Products', 'محصولات'),
    catalogHeading: L('Popular supplies', 'پرسفارش‌ترین‌ها'),
    categories: [
      { slug: 'cups', label: L('Cups', 'لیوان') },
      { slug: 'containers', label: L('Containers', 'ظرف و بسته‌بندی') },
      { slug: 'cutlery', label: L('Cutlery', 'قاشق و چنگال') },
    ],
    products: [
      { slug: 'paper-cups-1000', name: L('Paper cups 8 oz (1000 pcs)', 'لیوان کاغذی ۸ اونس (۱۰۰۰ عدد)'), description: L('Double-wall cups for hot drinks.', 'لیوان دوجداره برای نوشیدنی گرم.'), category: 'cups', price: 18_000_000, image: 'M6hYTF0JHak', colors: [c('White', 'سفید', '#f5f5f2'), c('Kraft', 'کرافت', '#b48a5a')], featured: true },
      { slug: 'food-containers-500', name: L('Food containers (500 pcs)', 'ظرف غذا (۵۰۰ عدد)'), description: L('Microwave-safe containers with lids.', 'ظرف مناسب مایکروویو با درب.'), category: 'containers', price: 22_000_000, image: 'AEU9UZstCfs', discount: 5, featured: true },
      { slug: 'storage-crates', name: L('Bulk packs and crates', 'بسته‌ها و جعبه‌های عمده'), description: L('Wholesale cartons for stocking up.', 'کارتن‌های عمده برای تأمین انبار.'), category: 'containers', price: 35_000_000, image: 'XDIeOJHMC8A', featured: true },
      { slug: 'cutlery-set-1000', name: L('Cutlery set (1000 pcs)', 'ست قاشق و چنگال (۱۰۰۰ عدد)'), description: L('Spoons, forks and knives, individually wrapped.', 'قاشق، چنگال و کارد؛ بسته‌بندی تکی.'), category: 'cutlery', price: 9_500_000, image: 'LZse1GUiPdo', featured: true },
    ],
    testimonials: [
      { quote: L('Orders always arrive on our delivery day — one less thing to worry about.', 'سفارش‌ها همیشه در روز مقرر می‌رسند؛ یک دغدغه کمتر.'), name: L('Behrouz K.', 'بهروز ک.'), role: L('Restaurant manager', 'مدیر رستوران') },
      { quote: L('Good prices for our café and great paper options.', 'قیمت مناسب برای کافه‌مان و گزینه‌های کاغذی خوب.'), name: L('Nazanin E.', 'نازنین ا.'), role: L('Café owner', 'صاحب کافه') },
    ],
    faq: [
      { question: L('What is the minimum order?', 'حداقل سفارش چقدر است؟'), answer: L('One carton per product.', 'یک کارتن از هر محصول.') },
      { question: L('Do you print logos?', 'چاپ لوگو انجام می‌دهید؟'), answer: L('Yes, on cups and bags for orders above 5,000 pieces.', 'بله، روی لیوان و ساک برای سفارش‌های بالای ۵۰۰۰ عدد.') },
      { question: L('Can we have a fixed delivery day?', 'امکان تحویل در روز ثابت هست؟'), answer: L('Yes, regular customers get a weekly delivery day.', 'بله، مشتریان دائمی روز تحویل هفتگی دارند.') },
    ],
    form: { type: 'demo', navLabel: L('Request a quote', 'درخواست پیش‌فاکتور'), heading: L('Request a quote or samples', 'درخواست پیش‌فاکتور یا نمونه'), intro: L('Tell us your business and quantities; we will send prices and samples.', 'کسب‌وکار و مقدار مورد نیازتان را بنویسید تا قیمت و نمونه برایتان بفرستیم.') },
    orders: true,
  },
];

export const templateByKey = (key: string) => SITE_TEMPLATES.find((t) => t.key === key);
