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
  | { key: string; kind: 'list'; label: Lbl; item: FieldDef[] };

const L = (en: string, fa: string): Lbl => ({ en, fa });

const eyebrow: FieldDef = { key: 'eyebrow', kind: 'loc', label: L('Eyebrow (small label)', 'برچسب کوچک') };
const heading: FieldDef = { key: 'heading', kind: 'loc', label: L('Heading', 'تیتر') };
const intro: FieldDef = { key: 'intro', kind: 'loc', label: L('Intro text', 'متن مقدمه'), multiline: true };
const image: FieldDef = { key: 'imageUrl', kind: 'image', label: L('Image', 'تصویر') };

export interface SectionMeta {
  label: Lbl;
  description: Lbl;
  /** Uses live catalog data rather than content typed into the section. */
  dynamic?: boolean;
  fields: FieldDef[];
}

export const sectionMeta: Record<SectionType, SectionMeta> = {
  'page-header': { label: L('Page header', 'سربرگ صفحه'), description: L('Title band for inner pages', 'عنوان بالای صفحات داخلی'), fields: [eyebrow, heading, intro] },
  hero: {
    label: L('Hero', 'بخش اصلی (Hero)'),
    description: L('Full-width image with headline and buttons', 'تصویر تمام‌عرض با تیتر و دکمه'),
    fields: [
      eyebrow,
      heading,
      { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      image,
      { key: 'primaryCta', kind: 'cta', label: L('Main button', 'دکمه اصلی') },
      { key: 'secondaryCta', kind: 'cta', label: L('Second button', 'دکمه دوم') },
      { key: 'height', kind: 'select', label: L('Height', 'ارتفاع'), options: [{ value: 'full', label: L('Full screen', 'تمام صفحه') }, { value: 'medium', label: L('Medium', 'متوسط') }] },
    ],
  },
  'rich-text': {
    label: L('Text', 'متن'),
    description: L('Paragraphs, lists (- ) and **bold**', 'پاراگراف، فهرست (- ) و **پررنگ**'),
    fields: [
      heading,
      { key: 'body', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      { key: 'width', kind: 'select', label: L('Width', 'عرض'), options: [{ value: 'narrow', label: L('Narrow', 'باریک') }, { value: 'wide', label: L('Wide', 'عریض') }] },
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
      { key: 'imageSide', kind: 'select', label: L('Image side', 'سمت تصویر'), options: [{ value: 'start', label: L('Start', 'ابتدا') }, { value: 'end', label: L('End', 'انتها') }] },
      { key: 'cta', kind: 'cta', label: L('Link', 'لینک') },
    ],
  },
  features: {
    label: L('Features', 'ویژگی‌ها'),
    description: L('Grid of short points, optional image', 'شبکه نکات کوتاه، با تصویر اختیاری'),
    fields: [
      eyebrow,
      heading,
      { ...image, label: L('Image (optional)', 'تصویر (اختیاری)') },
      { key: 'items', kind: 'list', label: L('Items', 'موارد'), item: [{ key: 'title', kind: 'loc', label: L('Title', 'عنوان') }, { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true }] },
    ],
  },
  stats: {
    label: L('Stats', 'آمار و ارقام'),
    description: L('Key numbers and press mentions', 'اعداد کلیدی و رسانه‌ها'),
    fields: [
      { ...eyebrow, label: L('Label above press list', 'برچسب رسانه‌ها') },
      { key: 'items', kind: 'list', label: L('Numbers', 'اعداد'), item: [{ key: 'value', kind: 'text', label: L('Value', 'مقدار') }, { key: 'label', kind: 'loc', label: L('Label', 'برچسب') }] },
      { key: 'publications', kind: 'strings', label: L('Press / clients', 'رسانه‌ها / مشتریان') },
    ],
  },
  services: {
    label: L('Services', 'خدمات'),
    description: L('Cards from your published services', 'کارت خدمات منتشرشده'),
    dynamic: true,
    fields: [eyebrow, heading, intro, { key: 'limit', kind: 'number', label: L('How many', 'تعداد'), min: 1, max: 24 }],
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
    ],
  },
  gallery: {
    label: L('Gallery / portfolio', 'گالری / نمونه‌کار'),
    description: L('Images with titles; optional category filter', 'تصاویر با عنوان؛ فیلتر دسته اختیاری'),
    fields: [
      eyebrow,
      heading,
      { key: 'filterable', kind: 'bool', label: L('Show category filter', 'نمایش فیلتر دسته') },
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
        ],
      },
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
          { key: 'cta', kind: 'cta', label: L('Button', 'دکمه') },
        ],
      },
    ],
  },
  cta: {
    label: L('Call to action', 'فراخوان اقدام'),
    description: L('Bold band with one button', 'نوار برجسته با یک دکمه'),
    fields: [
      heading,
      { key: 'text', kind: 'loc', label: L('Text', 'متن'), multiline: true },
      { key: 'cta', kind: 'cta', label: L('Button', 'دکمه') },
      { key: 'tone', kind: 'select', label: L('Colour', 'رنگ'), options: [{ value: 'dark', label: L('Dark', 'تیره') }, { value: 'accent', label: L('Accent', 'رنگ تأکید') }] },
    ],
  },
  'contact-form': {
    label: L('Contact form', 'فرم تماس'),
    description: L('Enquiry form saved to your inbox', 'فرم درخواست که در صندوق شما ذخیره می‌شود'),
    dynamic: true,
    fields: [eyebrow, heading, intro, { key: 'showDetails', kind: 'bool', label: L('Show contact details', 'نمایش اطلاعات تماس') }],
  },
};
