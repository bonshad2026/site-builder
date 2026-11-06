import {afterEach,expect,it,vi} from 'vitest';
import {ConsoleSmsSender,KavenegarSmsSender,withSmsFooter} from '../src/modules/auth/notifications.js';
import {createLogger} from '../src/common/logger.js';
afterEach(()=>vi.unstubAllGlobals());
it('puts the exact Persian footer on its own final line without duplicate legacy forms',()=>{
 expect(withSmsFooter('سفارش ثبت شد')).toBe('سفارش ثبت شد\nلغو ۱۱');
 expect(withSmsFooter('پیام آزمایشی \n لغو۱۱')).toBe('پیام آزمایشی\nلغو ۱۱');
 expect(withSmsFooter('پیام\nلغو 11\nلغو ۱۱\n')).toBe('پیام\nلغو ۱۱');
 expect(withSmsFooter(withSmsFooter('پیام'))).toBe('پیام\nلغو ۱۱');
});
it('applies the footer to development notification and OTP texts without changing the verification code',async()=>{
 const sender=new ConsoleSmsSender(createLogger('silent',false));
 await sender.sendText('09120000000','وضعیت سفارش');await sender.sendOtp('09120000000','123456');
 expect(sender.texts[0].text).toBe('وضعیت سفارش\nلغو ۱۱');
 expect(sender.outbox[0].text).toBe('کد تأیید شما: 123456\nلغو ۱۱');
 expect(sender.outbox[0].code).toBe('123456');
});
it('adds the footer before text reaches Kavenegar and preserves its numeric OTP template token',async()=>{
 const mock=vi.fn().mockImplementation(async()=>Response.json({return:{status:200}}));vi.stubGlobal('fetch',mock);
 const sender=new KavenegarSmsSender('test-key','verifycode','1000');
 await sender.sendText('09120000000','پیام\nلغو۱۱');
 const textUrl=new URL(String(mock.mock.calls[0][0]));
 expect(textUrl.searchParams.get('message')).toBe('پیام\nلغو ۱۱');
 await sender.sendOtp('09120000000','123456');
 const otpUrl=new URL(String(mock.mock.calls[1][0]));
 expect(otpUrl.pathname).toContain('/verify/lookup.json');
 expect(otpUrl.searchParams.get('token')).toBe('123456');
});
