import { describe, expect, it, vi, afterEach } from 'vitest';
import { sharedOrderText, shareOrder } from '../features/cart/shareOrder';
const lines=[{productId:'x',slug:'latte',name:{en:'Latte',fa:'لاته'},priceMinor:'125',currency:'IRR',quantity:2,imageUrl:null,variant:'Large'}];
afterEach(()=>vi.unstubAllGlobals());
describe('share checkout',()=>{
 it('includes quantities, choices and contact details without claiming delivery or inventing hidden prices',()=>{
  const text=sharedOrderText({shop:'Cafe',recipient:'@recipient',lines,name:n=>n.en,customer:{Name:' Customer ',Note:'No sugar',Email:''},showPrices:false,money:()=>{throw Error('Hidden price accessed');},labels:{order:'Request',customer:'Customer details',recipient:'Recipient'}});
  expect(text).toContain('2 × Latte (Large)');expect(text).toContain('@recipient');expect(text).toContain('Name: Customer');expect(text).toContain('Note: No sugar');expect(text).not.toContain('Email:');
 });
 it('uses native text sharing',async()=>{const share=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{userAgent:'Browser',share});expect(await shareOrder('Order text')).toBe('opened');expect(share).toHaveBeenCalledWith({title:'Order',text:'Order text'});});
 it('treats cancellation as cancellation',async()=>{vi.stubGlobal('navigator',{userAgent:'Browser',share:vi.fn().mockRejectedValue(new DOMException('cancelled','AbortError'))});expect(await shareOrder('Order')).toBe('cancelled');});
 it('offers fallback when sharing is unavailable or rejected',async()=>{vi.stubGlobal('navigator',{userAgent:'Browser'});expect(await shareOrder('Order')).toBe('unavailable');vi.stubGlobal('navigator',{userAgent:'Browser',share:vi.fn().mockRejectedValue(new Error('blocked'))});expect(await shareOrder('Order')).toBe('unavailable');});
});

it('passes encoded order text to the trusted Android wrapper without an account integration', async () => {
  const assign=vi.fn();vi.stubGlobal('navigator',{userAgent:'WebView SiteBuilderAndroid/1'});vi.stubGlobal('window',{location:{assign}});
  expect(await shareOrder('2 × Latte\nName: Test')).toBe('opened');
  expect(assign).toHaveBeenCalledWith('sitebuilder-share://order?text='+encodeURIComponent('2 × Latte\nName: Test'));
});
it('falls back instead of silently dropping an oversized Android message', async () => {
  const assign=vi.fn();vi.stubGlobal('navigator',{userAgent:'SiteBuilderAndroid/1'});vi.stubGlobal('window',{location:{assign}});
  expect(await shareOrder('x'.repeat(16001))).toBe('unavailable');expect(assign).not.toHaveBeenCalled();
});

it('copies text before opening the configured Instagram conversation', async () => {
  const writeText=vi.fn().mockResolvedValue(undefined),assign=vi.fn();vi.stubGlobal('navigator',{userAgent:'Mobile browser',clipboard:{writeText}});vi.stubGlobal('window',{location:{assign}});
  expect(await shareOrder('Order text',{kind:'instagram',username:'@_test.user'})).toBe('instagram-opened');
  expect(writeText).toHaveBeenCalledWith('Order text');expect(assign).toHaveBeenCalledWith('https://ig.me/m/_test.user');
});
it('does not leave the order page when clipboard permission is denied',async()=>{
  const assign=vi.fn();vi.stubGlobal('navigator',{userAgent:'Mobile browser',clipboard:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});vi.stubGlobal('window',{location:{assign}});
  expect(await shareOrder('Order',{kind:'instagram',username:'_test'})).toBe('unavailable');expect(assign).not.toHaveBeenCalled();
});
it('requests native copy-and-open only in a supporting Android wrapper',async()=>{
  const assign=vi.fn();vi.stubGlobal('navigator',{userAgent:'SiteBuilderAndroid/2'});vi.stubGlobal('window',{location:{assign}});
  expect(await shareOrder('Order',{kind:'instagram',username:'_test'})).toBe('instagram-opened');expect(assign).toHaveBeenCalledWith('sitebuilder-share://instagram-order?username=_test&text=Order');
  vi.stubGlobal('navigator',{userAgent:'SiteBuilderAndroid/1'});expect(await shareOrder('Order',{kind:'instagram',username:'_test'})).toBe('unavailable');
  expect(await shareOrder('Order',{kind:'instagram',username:'../bad'})).toBe('unavailable');
});
