import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { describePath, errorLine, explainError } from '../lib/errorText';

describe('error messages for people', () => {
  it('explains validation problems with where they are, in Persian and English', () => {
    const err = new ApiError(400, 'validation_failed', 'Invalid request body', [
      { path: 'fields.0.key', message: 'Every item already has a title and an address (slug); use another key', code: 'custom' },
      { path: 'name.fa', message: 'String must contain at most 80 character(s)', code: 'too_big', maximum: 80, type: 'string' },
      { path: 'slug', message: 'Required', code: 'invalid_type', received: 'undefined', expected: 'string' },
    ]);
    const fa = explainError(err, 'fa');
    expect(fa.summary).toBe('بعضی از اطلاعات ناقص یا نادرست است:');
    expect(fa.items[0]).toEqual({ where: 'فیلد ۱ › کلید', problem: expect.stringContaining('کلید دیگری بگذارید') });
    expect(fa.items[1].problem).toContain('۸۰');
    expect(fa.items[2]).toEqual({ where: 'آدرس (slug)', problem: 'این مورد لازم است.' });
    const en = explainError(err, 'en');
    expect(en.items[0].where).toBe('Field 1 › Key');
    expect(en.items[1].problem).toBe('At most 80 characters; shorten it.');
  });

  it('translates item values checked without a problem kind', () => {
    const err = new ApiError(400, 'bad_request', 'Some values are not valid', [
      { path: 'data.capacity', message: 'Expected number, received string' },
      { path: 'data.level', message: 'Not one of the choices' },
    ]);
    const fa = explainError(err, 'fa');
    expect(fa.summary).toBe('بعضی از مقادیر درست نیست:');
    expect(fa.items).toEqual([
      { where: 'مقادیر › «capacity»', problem: 'یک عدد وارد کنید.' },
      { where: 'مقادیر › «level»', problem: 'یکی از گزینه‌ها را انتخاب کنید.' },
    ]);
  });

  it('says what is already taken, what is full and what is missing', () => {
    expect(explainError(new ApiError(409, 'conflict', 'Already exists (collection_items_collection_id_slug_key)'), 'fa').summary).toContain('آدرس (slug) را تغییر دهید');
    expect(errorLine(new ApiError(409, 'conflict', 'Only 2 seats left for classes/hydrant-a'), 'fa')).toBe('برای «classes/hydrant-a» فقط 2 جای خالی مانده است. تعداد را کم کنید.');
    expect(explainError(new ApiError(404, 'not_found', 'Table not found'), 'en').summary).toBe('This table was not found (it may have been deleted). Reload the page.');
    expect(explainError(new ApiError(403, 'module_disabled', 'The orders module is not enabled for this site'), 'fa').summary).toContain('تنظیمات › ماژول‌ها');
  });

  it('explains limits and lost connections with what to do next', () => {
    const limited = explainError(new ApiError(429, 'rate_limited', 'Too many submissions, try again later'), 'fa');
    expect(limited.summary).toContain('چند دقیقه صبر کنید');
    const offline = explainError(new TypeError('Failed to fetch'), 'en');
    expect(offline).toEqual({ summary: 'The server could not be reached.', items: [], hint: 'Check your internet connection and try again.' });
  });

  it('keeps unknown messages as they are rather than hiding them', () => {
    expect(explainError(new ApiError(400, 'bad_request', 'Some brand new problem'), 'fa').summary).toBe('Some brand new problem');
    expect(describePath('sections.2.props.buttons.0.href', 'fa')).toBe('بخش ۳ › دکمه ۱ › لینک');
  });
});
