import type { Service } from '../types/site';

export const services: Service[] = [
  {
    slug: 'residential-design',
    title: { en: 'Residential Interiors', fa: 'طراحی داخلی مسکونی' },
    summary: {
      en: 'Full-home design from spatial planning to the last cushion.',
      fa: 'طراحی کامل خانه، از چیدمان فضا تا آخرین جزئیات.',
    },
    body: {
      en: 'We design homes around how you actually live. Every plan begins with a week of listening — routines, light, the objects you keep — and ends with rooms that feel inevitable. We coordinate contractors, joiners and suppliers so you deal with one studio, not twenty trades.',
      fa: 'خانه را بر اساس سبک واقعی زندگی شما طراحی می‌کنیم. هر طرح با یک هفته شنیدن آغاز می‌شود — عادت‌ها، نور و اشیایی که برایتان مهم‌اند — و به فضاهایی می‌رسد که طبیعی و ماندگارند. هماهنگی پیمانکاران، نجاران و تأمین‌کنندگان با ماست تا شما فقط با یک استودیو در ارتباط باشید.',
    },
    image: '1618221195710-dd6b41faaea6',
    duration: { en: '4 – 9 months', fa: '۴ تا ۹ ماه' },
    startingFrom: { en: 'From 18M IRR / m²', fa: 'از ۱۸ میلیون ریال برای هر متر مربع' },
    deliverables: [
      { en: 'Spatial plan and furniture layout', fa: 'نقشه فضا و چیدمان مبلمان' },
      { en: 'Material and finish palette', fa: 'پالت متریال و رنگ' },
      { en: 'Custom joinery drawings', fa: 'نقشه‌های اجرایی کابینت و نجاری' },
      { en: 'Lighting design', fa: 'طراحی نورپردازی' },
      { en: 'Site supervision to handover', fa: 'نظارت کارگاهی تا تحویل' },
    ],
    process: [
      { title: { en: 'Discovery', fa: 'شناخت' }, text: { en: 'Site survey, brief and budget alignment.', fa: 'بازدید، تدوین نیازها و توافق بودجه.' } },
      { title: { en: 'Concept', fa: 'ایده' }, text: { en: 'Mood, layout options and material direction.', fa: 'حال‌وهوا، گزینه‌های چیدمان و مسیر متریال.' } },
      { title: { en: 'Detailing', fa: 'جزئیات' }, text: { en: 'Technical drawings and procurement.', fa: 'نقشه‌های فنی و تأمین اقلام.' } },
      { title: { en: 'Delivery', fa: 'اجرا' }, text: { en: 'Build, install and styling.', fa: 'اجرا، نصب و چیدمان نهایی.' } },
    ],
  },
  {
    slug: 'hospitality-design',
    title: { en: 'Hospitality & Retail', fa: 'هتل، رستوران و فروشگاه' },
    summary: {
      en: 'Cafés, boutique hotels and stores that guests remember.',
      fa: 'کافه، هتل بوتیک و فروشگاهی که در یاد مهمان می‌ماند.',
    },
    body: {
      en: 'Commercial spaces must work hard and still feel generous. We balance operations — circulation, durability, maintenance — with an atmosphere that becomes part of your brand.',
      fa: 'فضای تجاری باید کارآمد باشد و همچنان دلنشین. ما میان نیازهای عملیاتی — گردش افراد، دوام و نگهداری — و فضایی که بخشی از هویت برند شماست تعادل برقرار می‌کنیم.',
    },
    image: '1600566753190-17f0baa2a6c3',
    duration: { en: '3 – 8 months', fa: '۳ تا ۸ ماه' },
    startingFrom: { en: 'Quoted per project', fa: 'برآورد بر اساس پروژه' },
    deliverables: [
      { en: 'Brand-led interior concept', fa: 'طراحی بر پایه هویت برند' },
      { en: 'Operational layout', fa: 'چیدمان عملیاتی' },
      { en: 'Furniture, fixtures and equipment schedule', fa: 'فهرست مبلمان و تجهیزات' },
      { en: 'Contractor tender package', fa: 'بسته مناقصه پیمانکار' },
    ],
    process: [
      { title: { en: 'Brief', fa: 'نیازسنجی' }, text: { en: 'Brand, capacity and operational review.', fa: 'بررسی برند، ظرفیت و عملیات.' } },
      { title: { en: 'Concept', fa: 'ایده' }, text: { en: 'Guest journey and spatial story.', fa: 'مسیر مهمان و روایت فضا.' } },
      { title: { en: 'Documentation', fa: 'مستندسازی' }, text: { en: 'Drawings, specs and tender.', fa: 'نقشه، مشخصات و مناقصه.' } },
      { title: { en: 'Opening', fa: 'افتتاح' }, text: { en: 'Supervision through opening day.', fa: 'نظارت تا روز افتتاح.' } },
    ],
  },
  {
    slug: 'design-consultation',
    title: { en: 'Design Consultation', fa: 'مشاوره طراحی' },
    summary: {
      en: 'A focused session for one room or one decision.',
      fa: 'جلسه‌ای متمرکز برای یک اتاق یا یک تصمیم.',
    },
    body: {
      en: 'Not every space needs a full project. In a two-hour session at your home we resolve layout, colour and lighting questions and leave you with a written plan you can execute yourself.',
      fa: 'هر فضایی به پروژه کامل نیاز ندارد. در یک جلسه دوساعته در محل، مسائل چیدمان، رنگ و نور را حل می‌کنیم و یک برنامه مکتوب برای اجرا به شما می‌دهیم.',
    },
    image: '1616486338812-3dadae4b4ace',
    duration: { en: '2 hours + written plan', fa: '۲ ساعت + برنامه مکتوب' },
    startingFrom: { en: '45M IRR per session', fa: '۴۵ میلیون ریال برای هر جلسه' },
    deliverables: [
      { en: 'On-site walkthrough', fa: 'بازدید حضوری' },
      { en: 'Written recommendations', fa: 'توصیه‌های مکتوب' },
      { en: 'Curated product list', fa: 'فهرست پیشنهادی اقلام' },
    ],
    process: [
      { title: { en: 'Book', fa: 'رزرو' }, text: { en: 'Share photos and your question.', fa: 'عکس و پرسش خود را بفرستید.' } },
      { title: { en: 'Visit', fa: 'بازدید' }, text: { en: 'Two focused hours on site.', fa: 'دو ساعت کار متمرکز در محل.' } },
      { title: { en: 'Plan', fa: 'برنامه' }, text: { en: 'Written plan within five days.', fa: 'برنامه مکتوب ظرف پنج روز.' } },
    ],
  },
  {
    slug: 'custom-furniture',
    title: { en: 'Custom Furniture', fa: 'مبلمان سفارشی' },
    summary: {
      en: 'Pieces drawn for your room and made by our workshops.',
      fa: 'قطعاتی که برای فضای شما طراحی و در کارگاه‌های همکار ساخته می‌شوند.',
    },
    body: {
      en: 'When the right piece does not exist, we draw it. Our partner workshops in Tehran and Isfahan work in solid walnut, brass, travertine and hand-loomed textiles.',
      fa: 'وقتی قطعه مناسب وجود ندارد، آن را طراحی می‌کنیم. کارگاه‌های همکار ما در تهران و اصفهان با گردو، برنج، سنگ تراورتن و پارچه‌های دست‌باف کار می‌کنند.',
    },
    image: '1555041469-a586c61ea9bc',
    duration: { en: '8 – 14 weeks', fa: '۸ تا ۱۴ هفته' },
    startingFrom: { en: 'Quoted per piece', fa: 'برآورد برای هر قطعه' },
    deliverables: [
      { en: 'Design drawings and samples', fa: 'نقشه طراحی و نمونه متریال' },
      { en: 'Workshop production', fa: 'ساخت در کارگاه' },
      { en: 'Delivery and installation', fa: 'ارسال و نصب' },
    ],
    process: [
      { title: { en: 'Sketch', fa: 'اسکیس' }, text: { en: 'Proportions and material samples.', fa: 'تناسبات و نمونه متریال.' } },
      { title: { en: 'Make', fa: 'ساخت' }, text: { en: 'Workshop build with progress photos.', fa: 'ساخت با گزارش تصویری.' } },
      { title: { en: 'Install', fa: 'نصب' }, text: { en: 'White-glove delivery.', fa: 'تحویل و نصب با دقت.' } },
    ],
  },
];
