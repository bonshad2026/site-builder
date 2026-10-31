import type { SectionType } from '@site-builder/shared';

type Lbl = { en: string; fa: string };

/** Describes how the settings panel edits one section prop. Validation lives in the shared schema. */
export type FieldDef =
  | { key: string; kind: 'loc'; label: Lbl; multiline?: boolean }
  | { key: string; kind: 'text'; label: Lbl }
  | { key: string; kind: 'href'; label: Lbl }
  | { key: string; kind: 'image'; label: Lbl }
  | { key: string; kind: 'number'; label: Lbl; min: number; max: number }
  | { key: string; kind: 'bool'; label: Lbl }
  | { key: string; kind: 'select'; label: Lbl; options: { value: string; label: Lbl }[] }
  | { key: string; kind: 'cta'; label: Lbl }
  | { key: string; kind: 'strings'; label: Lbl }
  | { key: string; kind: 'locList'; label: Lbl }
  | { key: string; kind: 'list'; label: Lbl; item: FieldDef[] }
  /** Any number of buttons / links, each with a label, a link picked from the site and a look. */
  | { key: string; kind: 'buttons'; label: Lbl }
  /** A hex colour, or empty for the theme's colour. */
  | { key: string; kind: 'color'; label: Lbl }
  /** A product category from the site settings (empty = all). */
  | { key: string; kind: 'category'; label: Lbl }
  /** A request type from the site settings. */
  | { key: string; kind: 'requestType'; label: Lbl }
  /** Optional width / height / fit / corners for an image. */
  | { key: string; kind: 'imageSize'; label: Lbl }
  /** A content table (or the shop's products) the section reads from. */
  | { key: string; kind: 'source'; label: Lbl }
  /** Fixed filters on the source's fields. */
  | { key: string; kind: 'filters'; label: Lbl }
  /** Sort field of the source (with `dir`). */
  | { key: string; kind: 'sortField'; label: Lbl }
  /** Filters shown to visitors. */
  | { key: string; kind: 'visitorFilters'; label: Lbl }
  /** The box design: `cardDesign` (shared) and `card` (own) together. */
  | { key: string; kind: 'card'; label: Lbl }
  /** One item of the source (empty = the item whose page this is). */
  | { key: string; kind: 'itemSlug'; label: Lbl };

const L = (en: string, fa: string): Lbl => ({ en, fa });

const eyebrow: FieldDef = { key: 'eyebrow', kind: 'loc', label: L('Eyebrow (small label)', 'برچسب کوچک') };
const heading: FieldDef = { key: 'heading', kind: 'loc', label: L('Heading', 'تیتر') };
const intro: FieldDef = { key: 'intro', kind: 'loc', label: L('Intro text', 'متن مقدمه'), multiline: true };
const image: FieldDef = { key: 'imageUrl', kind: 'image', label: L('Image', 'تصویر') };
const buttons: FieldDef = { key: 'buttons', kind: 'buttons', label: L('Buttons & links', 'دکمه‌ها و لینک‌ها') };
const imageSize: FieldDef = { key: 'imageSize', kind: 'imageSize', label: L('Image size (optional)', 'اندازه تصویر (اختیاری)') };
const sizes = [
  { value: 'sm', label: L('Small', 'کوچک') },
  { value: 'md', label: L('Normal', 'معمولی') },
  { value: 'lg', label: L('Large', 'بزرگ') },
  { value: 'xl', label: L('Extra large', 'خیلی بزرگ') },
];

export interface SectionMeta {
  label: Lbl;
  description: Lbl;
  /** Uses live catalog data rather than content typed into the section. */
  dynamic?: boolean;
  fields: FieldDef[];
}

export const sectionMeta: Record<SectionType, SectionMeta> = {
  'page-header': { label: L('Page header', 'سربرگ صفحه'), description: L('Title band for inner pages', 'عنوان بالای صفحات داخلی'), fields: [eyebrow, heading, intro, buttons] },
  hero: {
    label: L('Hero', 'بخش اصلی (Hero)'),
    description: L('Full-width images with headlines and buttons; one slide or a slider', 'تصاویر تمام‌عرض با تیتر و دکمه؛ یک اسلاید یا اسلایدر'),
    fields: [
      {
        key: 'slides',
        kind: 'list',
        label: L('Slides', 'اسلایدها'),
        item: [eyebrow, heading, { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true }, image, buttons],
      },
      { key: 'display', kind: 'select', label: L('Show as', 'نمایش'), options: [{ value: 'single', label: L('First slide only', 'فقط اسلاید اول') }, { value: 'slider', label: L('Slider', 'اسلایدر') }] },
      { key: 'autoplay', kind: 'number', label: L('Seconds per slide (0 = arrows only)', 'ثانیه برای هر اسلاید (۰ = فقط با فلش)'), min: 0, max: 30 },
      {
        key: 'height',
        kind: 'select',
        label: L('Height', 'ارتفاع'),
        options: [
          { value: 'small', label: L('Small (half screen)', 'کوتاه (نصف صفحه)') },
          { value: 'medium', label: L('Medium', 'متوسط') },
          { value: 'large', label: L('Large', 'بلند') },
          { value: 'full', label: L('Full screen', 'تمام صفحه') },
          { value: 'custom', label: L('Custom (pixels below)', 'دلخواه (پیکسل در کادر پایین)') },
        ],
      },
      { key: 'customHeight', kind: 'number', label: L('Custom height (px, at least 200)', 'ارتفاع دلخواه (پیکسل، حداقل ۲۰۰)'), min: 0, max: 2000 },
      {
        key: 'frame',
        kind: 'select',
        label: L('Width', 'عرض'),
        options: [
          { value: 'full', label: L('Full width', 'تمام‌عرض') },
          { value: 'contained', label: L('Inside the page width (rounded box)', 'داخل عرض صفحه (کادر گرد)') },
        ],
      },
    ],
  },
  'rich-text': {
    label: L('Text', 'متن'),
    description: L('Paragraphs, lists (- ) and **bold**', 'پاراگراف، فهرست (- ) و **پررنگ**'),
    fields: [
      heading,
      { key: 'body', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      { key: 'width', kind: 'select', label: L('Width', 'عرض'), options: [{ value: 'narrow', label: L('Narrow', 'باریک') }, { value: 'wide', label: L('Wide', 'عریض') }] },
      buttons,
    ],
  },
  'image-text': {
    label: L('Image & text', 'تصویر و متن'),
    description: L('Image beside a block of text', 'تصویر کنار متن'),
    fields: [
      eyebrow,
      heading,
      { key: 'body', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      image,
      imageSize,
      { key: 'imageSide', kind: 'select', label: L('Image side', 'سمت تصویر'), options: [{ value: 'start', label: L('Start', 'ابتدا') }, { value: 'end', label: L('End', 'انتها') }] },
      buttons,
    ],
  },
  features: {
    label: L('Features', 'ویژگی‌ها'),
    description: L('Grid of short points, optional image', 'شبکه نکات کوتاه، با تصویر اختیاری'),
    fields: [
      eyebrow,
      heading,
      { ...image, label: L('Image (optional)', 'تصویر (اختیاری)') },
      imageSize,
      { key: 'items', kind: 'list', label: L('Items', 'موارد'), item: [{ key: 'title', kind: 'loc', label: L('Title', 'عنوان') }, { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true }] },
      {
        key: 'marker',
        kind: 'select',
        label: L('Numbering', 'شماره‌گذاری'),
        options: [
          { value: 'roman', label: L('Roman (I, II, III)', 'رومی (I، II، III)') },
          { value: 'number', label: L('Numbers (1, 2, 3)', 'عدد (۱، ۲، ۳)') },
          { value: 'bullet', label: L('Bullet (•)', 'گلوله (•)') },
          { value: 'none', label: L('None', 'هیچ') },
        ],
      },
      { key: 'markerPosition', kind: 'select', label: L('Number position', 'محل شماره'), options: [{ value: 'above', label: L('On its own line', 'در یک خط جدا') }, { value: 'inline', label: L('Beside the title', 'کنار عنوان') }] },
      { key: 'titleSize', kind: 'select', label: L('Title size', 'اندازه‌ی عنوان'), options: sizes },
      { key: 'titleColor', kind: 'color', label: L('Title colour', 'رنگ عنوان') },
      { key: 'textSize', kind: 'select', label: L('Text size', 'اندازه‌ی متن'), options: sizes },
      { key: 'textColor', kind: 'color', label: L('Text colour', 'رنگ متن') },
      buttons,
    ],
  },
  stats: {
    label: L('Stats', 'آمار و ارقام'),
    description: L('Key numbers and press mentions', 'اعداد کلیدی و رسانه‌ها'),
    fields: [
      { ...eyebrow, label: L('Label above press list', 'برچسب رسانه‌ها') },
      { key: 'items', kind: 'list', label: L('Numbers', 'اعداد'), item: [{ key: 'value', kind: 'text', label: L('Value', 'مقدار') }, { key: 'label', kind: 'loc', label: L('Label', 'برچسب') }] },
      { key: 'publications', kind: 'strings', label: L('Press / clients', 'رسانه‌ها / مشتریان') },
      buttons,
    ],
  },
  services: {
    label: L('Services', 'خدمات'),
    description: L('Cards from your published services', 'کارت خدمات منتشرشده'),
    dynamic: true,
    fields: [eyebrow, heading, intro, { key: 'limit', kind: 'number', label: L('How many', 'تعداد'), min: 1, max: 24 }, buttons],
  },
  products: {
    label: L('Products', 'محصولات'),
    description: L('Products from your catalog', 'محصولات از کاتالوگ'),
    dynamic: true,
    fields: [
      eyebrow,
      heading,
      intro,
      { key: 'filter', kind: 'select', label: L('Show', 'نمایش'), options: [{ value: 'featured', label: L('Featured only', 'فقط منتخب') }, { value: 'all', label: L('All', 'همه') }] },
      { key: 'limit', kind: 'number', label: L('How many', 'تعداد'), min: 1, max: 48 },
      { key: 'category', kind: 'category', label: L('Only this category', 'فقط این گروه') },
      { key: 'showDiscount', kind: 'bool', label: L('Show discounts', 'نمایش تخفیف') },
      { key: 'showColors', kind: 'bool', label: L('Show colours', 'نمایش رنگ‌ها') },
      { key: 'showStock', kind: 'bool', label: L('Show how many are left', 'نمایش تعداد موجودی') },
      { key: 'hideOutOfStock', kind: 'bool', label: L('Hide sold-out products', 'پنهان کردن محصولات ناموجود') },
      { key: 'showAddToCart', kind: 'bool', label: L('Show an add to cart button', 'نمایش دکمه افزودن به سبد') },
      { key: 'columns', kind: 'number', label: L('Products per row', 'تعداد در هر ردیف'), min: 1, max: 6 },
      buttons,
    ],
  },
  gallery: {
    label: L('Gallery / portfolio', 'گالری / نمونه‌کار'),
    description: L('Images with titles; optional category filter', 'تصاویر با عنوان؛ فیلتر دسته اختیاری'),
    fields: [
      eyebrow,
      heading,
      { key: 'filterable', kind: 'bool', label: L('Show category filter', 'نمایش فیلتر دسته') },
      { ...imageSize, label: L('Image size for all items (optional)', 'اندازه تصویر همه موارد (اختیاری)') },
      {
        key: 'items',
        kind: 'list',
        label: L('Items', 'موارد'),
        item: [
          image,
          { key: 'title', kind: 'loc', label: L('Title', 'عنوان') },
          { key: 'caption', kind: 'loc', label: L('Caption', 'توضیح'), multiline: true },
          { key: 'category', kind: 'loc', label: L('Category', 'دسته') },
          { key: 'meta', kind: 'text', label: L('Detail (e.g. year)', 'جزئیات (مثلاً سال)') },
          { key: 'href', kind: 'href', label: L('Link (optional)', 'لینک (اختیاری)') },
        ],
      },
      buttons,
    ],
  },
  testimonials: {
    label: L('Testimonials', 'نظرات مشتریان'),
    description: L('Quotes as a slider or grid', 'نقل‌قول به‌صورت اسلایدر یا شبکه'),
    fields: [
      eyebrow,
      heading,
      { key: 'layout', kind: 'select', label: L('Layout', 'چیدمان'), options: [{ value: 'slider', label: L('Slider', 'اسلایدر') }, { value: 'grid', label: L('Grid', 'شبکه') }] },
      {
        key: 'items',
        kind: 'list',
        label: L('Quotes', 'نقل‌قول‌ها'),
        item: [
          { key: 'quote', kind: 'loc', label: L('Quote', 'متن'), multiline: true },
          { key: 'name', kind: 'loc', label: L('Name', 'نام') },
          { key: 'role', kind: 'loc', label: L('Role / project', 'سمت / پروژه') },
        ],
      },
      buttons,
    ],
  },
  faq: {
    label: L('FAQ', 'پرسش‌های متداول'),
    description: L('Questions and answers (accordion)', 'پرسش و پاسخ (آکاردئون)'),
    fields: [
      eyebrow,
      heading,
      { key: 'searchable', kind: 'bool', label: L('Show search box', 'نمایش جست‌وجو') },
      { key: 'items', kind: 'list', label: L('Questions', 'پرسش‌ها'), item: [{ key: 'question', kind: 'loc', label: L('Question', 'پرسش') }, { key: 'answer', kind: 'loc', label: L('Answer', 'پاسخ'), multiline: true }] },
      buttons,
    ],
  },
  pricing: {
    label: L('Pricing', 'قیمت‌گذاری'),
    description: L('Up to four plans', 'حداکثر چهار طرح'),
    fields: [
      eyebrow,
      heading,
      {
        key: 'plans',
        kind: 'list',
        label: L('Plans', 'طرح‌ها'),
        item: [
          { key: 'name', kind: 'loc', label: L('Name', 'نام') },
          { key: 'price', kind: 'loc', label: L('Price', 'قیمت') },
          { key: 'period', kind: 'loc', label: L('Period', 'دوره') },
          { key: 'features', kind: 'locList', label: L('Features', 'ویژگی‌ها') },
          { key: 'highlighted', kind: 'bool', label: L('Highlight', 'برجسته') },
          { ...buttons, label: L('Buttons', 'دکمه‌ها') },
        ],
      },
      buttons,
    ],
  },
  cta: {
    label: L('Call to action', 'فراخوان اقدام'),
    description: L('Bold band with buttons', 'نوار برجسته با دکمه'),
    fields: [
      heading,
      { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      { ...buttons, label: L('Buttons', 'دکمه‌ها') },
      { key: 'tone', kind: 'select', label: L('Colour', 'رنگ'), options: [{ value: 'dark', label: L('Dark', 'تیره') }, { value: 'accent', label: L('Accent', 'رنگ تأکید') }] },
    ],
  },
  'collection-list': {
    label: L('List from a table', 'لیست از جدول'),
    description: L('Items of a content table (classes, news…) or products, as boxes or a list, with filters', 'آیتم‌های یک جدول (کلاس‌ها، اخبار…) یا محصولات، به‌صورت باکس یا لیست، با فیلتر'),
    dynamic: true,
    fields: [
      eyebrow,
      heading,
      intro,
      { key: 'source', kind: 'source', label: L('Table', 'جدول') },
      { key: 'filters', kind: 'filters', label: L('Show only items where…', 'فقط آیتم‌هایی که…') },
      { key: 'sort', kind: 'sortField', label: L('Sort by', 'مرتب‌سازی بر اساس') },
      { key: 'limit', kind: 'number', label: L('Items per page', 'تعداد آیتم در هر صفحه'), min: 1, max: 60 },
      {
        key: 'pagination',
        kind: 'select',
        label: L('More items', 'آیتم‌های بیشتر'),
        options: [
          { value: 'none', label: L('Only the first ones', 'فقط همین تعداد') },
          { value: 'more', label: L('“Show more” button', 'دکمه‌ی «نمایش بیشتر»') },
          { value: 'pages', label: L('Page numbers', 'شماره صفحه') },
        ],
      },
      { key: 'showSearch', kind: 'bool', label: L('Search box for visitors', 'جستجو برای بازدیدکننده') },
      { key: 'visitorFilters', kind: 'visitorFilters', label: L('Filters for visitors', 'فیلترهای بازدیدکننده') },
      {
        key: 'filtersLayout',
        kind: 'select',
        label: L('Filters are shown', 'نحوه‌ی چیدن فیلترها'),
        options: [
          { value: 'inline', label: L('One after another', 'پشت سر هم') },
          { value: 'stacked', label: L('Below each other', 'زیر هم') },
        ],
      },
      {
        key: 'layout',
        kind: 'select',
        label: L('Layout', 'نحوه نمایش'),
        options: [
          { value: 'grid', label: L('Boxes in columns', 'باکس در ستون‌ها') },
          { value: 'list', label: L('List (one per row)', 'لیست (هر سطر یکی)') },
        ],
      },
      { key: 'columns', kind: 'number', label: L('Boxes per row (desktop)', 'باکس در هر سطر (دسکتاپ)'), min: 1, max: 6 },
      { key: 'columnsTablet', kind: 'number', label: L('Boxes per row (tablet)', 'باکس در هر سطر (تبلت)'), min: 1, max: 4 },
      { key: 'columnsMobile', kind: 'number', label: L('Boxes per row (mobile)', 'باکس در هر سطر (موبایل)'), min: 1, max: 2 },
      { key: 'gap', kind: 'number', label: L('Space between boxes', 'فاصله بین باکس‌ها'), min: 0, max: 12 },
      { key: 'card', kind: 'card', label: L('Box design', 'طراحی باکس') },
      { key: 'emptyText', kind: 'loc', label: L('Text when nothing matches', 'متن وقتی موردی نیست') },
      buttons,
    ],
  },
  'collection-item': {
    label: L('Item display', 'نمایش آیتم'),
    description: L('One item drawn with a box design; on a table’s template page, the item of that page', 'یک آیتم با طراحی باکس؛ در صفحه‌ی قالب جدول، آیتم همان صفحه'),
    dynamic: true,
    fields: [
      { key: 'source', kind: 'source', label: L('Table', 'جدول') },
      { key: 'itemSlug', kind: 'itemSlug', label: L('Item', 'آیتم') },
      { key: 'card', kind: 'card', label: L('Box design', 'طراحی باکس') },
    ],
  },
  'contact-form': {
    label: L('Request form', 'فرم درخواست'),
    description: L('A request (consultation, booking, demo, question…) saved to Customer Requests', 'درخواست (مشاوره، رزرو، دمو، سؤال…)؛ در «درخواست‌های مشتریان» ذخیره می‌شود'),
    dynamic: true,
    fields: [
      eyebrow,
      heading,
      intro,
      { key: 'requestType', kind: 'requestType', label: L('Request type', 'نوع درخواست') },
      { key: 'submitLabel', kind: 'loc', label: L('Button text (empty = default)', 'متن دکمه (خالی = پیش‌فرض)') },
      { key: 'showDetails', kind: 'bool', label: L('Show contact details', 'نمایش اطلاعات تماس') },
      buttons,
    ],
  },
};
