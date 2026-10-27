import type { Project } from '../types/site';

export const projects: Project[] = [
  {
    slug: 'elahieh-residence',
    title: { en: 'Elahieh Residence', fa: 'اقامتگاه الهیه' },
    location: { en: 'Tehran', fa: 'تهران' },
    year: 2025,
    category: 'residential',
    area: '420 m²',
    image: '1600210492486-724fe5c67fb0',
    summary: {
      en: 'A family home reorganised around a central courtyard of light.',
      fa: 'خانه‌ای خانوادگی که حول یک حیاط نورگیر مرکزی بازطراحی شد.',
    },
  },
  {
    slug: 'kish-villa',
    title: { en: 'Coastal Villa', fa: 'ویلای ساحلی' },
    location: { en: 'Kish Island', fa: 'جزیره کیش' },
    year: 2024,
    category: 'residential',
    area: '610 m²',
    image: '1600585154340-be6161a56a0c',
    summary: {
      en: 'Limewashed walls and teak, built for salt air and long summers.',
      fa: 'دیوارهای آهکی و چوب ساج، برای هوای شور و تابستان‌های بلند.',
    },
  },
  {
    slug: 'saray-hotel-lobby',
    title: { en: 'Saray Boutique Hotel', fa: 'هتل بوتیک سرای' },
    location: { en: 'Isfahan', fa: 'اصفهان' },
    year: 2024,
    category: 'hospitality',
    area: '1,150 m²',
    image: '1631679706909-1844bbd07221',
    summary: {
      en: 'Twenty-two rooms in a restored Qajar house.',
      fa: 'بیست‌ودو اتاق در خانه‌ای مرمت‌شده از دوره قاجار.',
    },
  },
  {
    slug: 'niavaran-apartment',
    title: { en: 'Niavaran Apartment', fa: 'آپارتمان نیاوران' },
    location: { en: 'Tehran', fa: 'تهران' },
    year: 2023,
    category: 'residential',
    area: '185 m²',
    image: '1600607687939-ce8a6c25118c',
    summary: {
      en: 'A compact apartment that lives like a house.',
      fa: 'آپارتمانی جمع‌وجور که حس یک خانه را دارد.',
    },
  },
  {
    slug: 'atlas-studio-office',
    title: { en: 'Atlas Architects Office', fa: 'دفتر معماری اطلس' },
    location: { en: 'Tehran', fa: 'تهران' },
    year: 2023,
    category: 'workspace',
    area: '340 m²',
    image: '1497366216548-37526070297c',
    summary: {
      en: 'A quiet, daylit workspace for a team of thirty.',
      fa: 'فضای کاری آرام و پرنور برای تیمی سی‌نفره.',
    },
  },
  {
    slug: 'tajrish-cafe',
    title: { en: 'Tajrish Café', fa: 'کافه تجریش' },
    location: { en: 'Tehran', fa: 'تهران' },
    year: 2022,
    category: 'hospitality',
    area: '120 m²',
    image: '1600121848594-d8644e57abab',
    summary: {
      en: 'Terrazzo, brass and a long communal table.',
      fa: 'ترازو، برنج و یک میز بلند مشترک.',
    },
  },
];
