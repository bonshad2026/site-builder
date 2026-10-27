import type { Testimonial } from '../types/site';

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    quote: {
      en: 'They listened for a full week before drawing a line. The house finally works the way our family does.',
      fa: 'یک هفته کامل فقط گوش دادند و بعد طراحی کردند. حالا خانه دقیقاً مطابق زندگی خانواده ما کار می‌کند.',
    },
    name: { en: 'Leila M.', fa: 'لیلا م.' },
    role: { en: 'Homeowner', fa: 'مالک' },
    project: { en: 'Elahieh Residence', fa: 'اقامتگاه الهیه' },
  },
  {
    id: 't2',
    quote: {
      en: 'Guests photograph the lobby before they check in. Occupancy is up and the space is easy to maintain.',
      fa: 'مهمان‌ها قبل از پذیرش از لابی عکس می‌گیرند. ضریب اشغال بالا رفته و نگهداری فضا هم ساده است.',
    },
    name: { en: 'Reza K.', fa: 'رضا ک.' },
    role: { en: 'General Manager', fa: 'مدیر کل' },
    project: { en: 'Saray Boutique Hotel', fa: 'هتل بوتیک سرای' },
  },
  {
    id: 't3',
    quote: {
      en: 'On time, on budget, and every contractor answered to them, not to us. That alone was worth it.',
      fa: 'به‌موقع و در محدوده بودجه؛ و همه پیمانکاران به آن‌ها پاسخ‌گو بودند، نه به ما. همین به‌تنهایی ارزشش را داشت.',
    },
    name: { en: 'Sara & Kian A.', fa: 'سارا و کیان ا.' },
    role: { en: 'Homeowners', fa: 'مالکان' },
    project: { en: 'Niavaran Apartment', fa: 'آپارتمان نیاوران' },
  },
  {
    id: 't4',
    quote: {
      en: 'Our team asked to come back to the office. I did not think that was possible.',
      fa: 'تیم ما خودش خواست به دفتر برگردد. فکر نمی‌کردم چنین چیزی ممکن باشد.',
    },
    name: { en: 'Babak T.', fa: 'بابک ت.' },
    role: { en: 'Founding Partner', fa: 'شریک مؤسس' },
    project: { en: 'Atlas Architects Office', fa: 'دفتر معماری اطلس' },
  },
];
