import { menuDocument } from './menu.mjs';
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4000/api/v1';
let cookie = '', csrf = '';
async function api(path, method = 'GET', body) {
  const multipart = body instanceof FormData;
  const r = await fetch(base + path, { method, headers: { Cookie: cookie, 'x-csrf-token': csrf, ...(!multipart && body ? {'Content-Type':'application/json'} : {}) }, body: body ? (multipart ? body : JSON.stringify(body)) : undefined });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(c=>c.split(';')[0]).join('; ');
  const raw = await r.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`);
  return data.data;
}
const login = await api('/auth/login','POST',{email:'admin',password:process.env.STUDIO_PASSWORD || '123456'}); csrf = login.csrfToken;
const existing = await api('/platform/tenants?pageSize=100');
console.log('Sites:', existing.map(s=>s.slug).join(', '));
if (process.argv.includes('--inspect')) { await api('/auth/logout', 'POST', {}); process.exitCode = 0; } else {
const found = existing.find(s=>s.slug === 'cafe-mohammad');
if (found && !process.argv.includes('--update')) throw new Error('Site already exists; pass --update only to replace this cafe design.');
const site = found || await api('/platform/tenants','POST',{slug:'cafe-mohammad',name:'کافه محمد',ownerEmail:'cafe-mohammad@example.test',setup:{languages:'fa',theme:'ivory',accent:'#d97706',pages:{},forms:[{id:'reservation',menu:'none',notify:false},{id:'contact',menu:'none',notify:false}],mainForm:'reservation',header:{search:false,cart:false,account:false,language:false,theme:false},shop:{orders:false},accounts:{enabled:false},demo:{enabled:false},contact:{phone:'07143230965',address:'مرودشت، روبه‌روی کوچه مسجد جامع، کنار پاساژ انقلاب، کوی علی‌قلی حمزه',hours:'۷ صبح تا ۸ شب',instagram:'cafe_mohammad_'}}});
console.log(found ? 'Updating:' : 'Created:', site.slug);
const root = '/sites/cafe-mohammad';
const L = (fa,en=fa)=>({fa,en});
const B = (fa,href,style='primary')=>({label:L(fa),href,style});
const source = process.env.CAFE_ASSETS || new URL('../../var/cafe-mohammad/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const ids=['logo','d81eaf0ebad3928e','d6dd37ec3d913b42','ea0cfdbdfa562cd0','497f93654b44f94a','1dc8fca7cbf295fb'];
const photos=[];
for (const id of ids) {
 const form = new FormData(); form.set('file',new Blob([await readFile(`${source}/${id}.jpg`)],{type:'image/jpeg'}),`${id}.jpg`); form.set('altFa','کافه محمد؛ از صفحه رسمی اینستاگرام');
 const a=await api(root+'/assets','POST',form); photos.push({...a,url:new URL(a.url,'http://127.0.0.1').pathname});
}
let settings=await api(root+'/settings');
settings.name=L('کافه محمد','Cafe Mohammad'); settings.tagline=L('صبحانه، قهوه و یک حالِ خوب','Breakfast, coffee & good company');
settings.logoUrl=photos[0].url; settings.logoAssetId=photos[0].id;
settings.themeId='mohammad'; settings.accentColor='#c46608';
settings.design.themes=[{id:'mohammad',name:L('صبح نارنجی','Orange morning'),colors:{bg:'#fff9ef',surface:'#ffffff',surface2:'#f9ecd6',ink:'#2b2118',inkSoft:'#75614e',line:'#e8d8bf',accent:'#c46608',accentInk:'#ffffff',accentSoft:'#ffead0'}}];
settings.header={...settings.header,brand:'both',transparentOverHero:false,showCart:false,showAccount:false,showSearch:false,showTheme:false,showLanguage:false,buttons:[B('درخواست رزرو','/reservation')]};
settings.headerCta={label:L('درخواست رزرو'),href:'/reservation'};
settings.nav=[['/','خانه'],['/menu','منوی کافه'],['/about','داستان ما'],['/gallery','قاب‌های کافه'],['/contact','تماس و نشانی']].map(([href,fa])=>({href,label:L(fa)}));
settings.social=[{label:'Instagram',icon:'instagram',href:'https://www.instagram.com/cafe_mohammad_/'}]; settings.socialDisplay='both';
settings.footer={...settings.footer,showLogo:true,columns:[{title:L('صبح‌تان را مهمان ما باشید'),text:L('صبحانه‌های ایرانی و انگلیسی، قهوه و نوشیدنی؛ در قلب مرودشت.'),links:[],column:4}]};
settings.texts={...settings.texts,'contact.visit':L('به کافه سر بزنید','Visit the cafe')};
settings.modules={...settings.modules,products:false,services:false,orders:false};
const reservation=settings.requestTypes.find(t=>t.slug==='reservation');
if(reservation) { const time=reservation.fields.find(f=>f.id==='time'); if(time) time.options=['07:00','08:00','09:00','10:00','12:00','14:00','16:00','18:00','19:00'].map(v=>({en:v,fa:v,price:0})); reservation.label=L('درخواست رزرو میز'); reservation.layout.successText=L('درخواست شما ثبت شد. رزرو پس از تماس و تأیید کافه قطعی می‌شود.'); }
await api(root+'/settings','PUT',settings);
const section=(type,props)=>({id:crypto.randomUUID(),type,props});
const head=(heading,intro='')=>section('page-header',{eyebrow:L('CAFE MOHAMMAD','CAFE MOHAMMAD'),heading:L(heading),intro:L(intro)});
const imageText=(heading,body,img=photos[3].url)=>section('image-text',{eyebrow:L('صبحانه و قهوه در مرودشت'),heading:L(heading),body:L(body),imageUrl:img,imageSize:{height:480,radius:24},buttons:[B('منو را ببینید','/menu','link')]});
const cta=()=>section('cta',{heading:L('قرارِ بعدی، کافه محمد'),text:L('برای هماهنگی میز یا سفارش بیرون‌بر با ما تماس بگیرید.'),tone:'accent',buttons:[B('تماس با کافه','tel:07143230965'),B('درخواست رزرو میز','/reservation','secondary')]});
const gallery=()=>section('gallery',{heading:L('یک قاب از حال‌وهوای ما'),items:photos.slice(1).map((p,i)=>({imageUrl:p.url,title:L(['صبحانه در کنار دوستان','یک صبحِ خوش‌طعم','طعم‌های کافه محمد','نوشیدنی و تازگی','وقت قهوه'][i]),caption:L('از صفحهٔ رسمی کافه محمد'),category:L('کافه محمد'),href:'https://www.instagram.com/cafe_mohammad_/'})),imageSize:{height:360,radius:18}});
const contactText='مرودشت، روبه‌روی کوچه مسجد جامع، کنار پاساژ انقلاب، کوی علی‌قلی حمزه\n\nساعت فعالیت اعلام‌شده در پیج: ۷ صبح تا ۸ شب\n\nتلفن: ۰۷۱۴۳۲۳۰۹۶۵\nموبایل: ۰۹۳۵۹۶۲۰۰۴۳\n\nبرای اطلاع از موجودی روز، قیمت‌ها و هماهنگی ارسال در مرودشت تماس بگیرید.';
const pages=[
 ['home','خانه',[
 section('hero',{height:'large',frame:'contained',slides:[{eyebrow:L('کافه محمد · مرودشت'),heading:L('صبحِ خوب،\nاز اینجا شروع می‌شه'),text:L('عطر قهوه، صبحانهٔ گرم و یک میز برای باهم‌بودن. به کافه محمد خوش آمدید.'),imageUrl:photos[2].url,buttons:[B('کشف منوی کافه','/menu'),B('با ما تماس بگیرید','/contact','secondary')]}]}),
 section('stats',{items:[{value:'۰۷—۲۰',label:L('از صبح تا شب')},{value:'مرودشت',label:L('قرارِ خوش‌طعم ما')},{value:'صبحانه + قهوه',label:L('بهانه‌ای برای باهم‌بودن')}]}),
 imageText('برای یک صبحِ بی‌عجله','از املت و نیمرو تا صبحانهٔ انگلیسی؛ کنار یک فنجان قهوه، با آدم‌هایی که دوستشان دارید.\n\n«کیفیت، وظیفهٔ ماست»؛ همان قولی که در پیج کافه محمد می‌خوانید.'),
 section('features',{heading:L('امروز دلت چی می‌خواد؟'),marker:'none',items:[{title:L('صبحانهٔ ایرانی'),text:L('املت، نیمرو، قرمه و دیس پنیر؛ انتخاب‌های آشنای یک صبح دل‌چسب.')},{title:L('صبحانهٔ انگلیسی'),text:L('یک انتخاب متفاوت برای شروع روز؛ موجودی را از کافه بپرسید.')},{title:L('قهوه، کیک و نوشیدنی'),text:L('از یک فنجان قهوه تا نوشیدنی سرد و یک برش کیک.')}],buttons:[B('دیدن منوی کامل','/menu','link')]}),gallery(),cta()]],
 ['menu','منوی کافه',[head('صبحانه تا آخرین جرعه','این منوی معرفی اولیه است؛ قیمت و موجودی روز را تلفنی بپرسید.'),
 section('features',{heading:L('صبحانه‌های ایرانی'),marker:'none',items:[['املت','طعم آشنای صبحانهٔ ایرانی.'],['نیمرو','ساده و دوست‌داشتنی، برای شروع روز.'],['قرمه','از انتخاب‌های معرفی‌شده در پیج کافه.'],['کباب تابه‌ای','برای یک صبحانهٔ حسابی.'],['دیس پنیر','یک انتخاب برای دورهمی صبحانه.'],['خامه و عسل','یک ترکیب شیرین و آشنا.']].map(([title,text])=>({title:L(title),text:L(text)}))}),
 imageText('یک انتخاب متفاوت؛ صبحانهٔ انگلیسی','صبحانهٔ انگلیسی هم در معرفی‌های پیج کافه دیده می‌شود. برای جزئیات ترکیب بشقاب و موجودی امروز با ما تماس بگیرید.',photos[3].url),
 section('features',{heading:L('کنار صبحانه، یا برای یک عصرِ خوب'),marker:'none',items:[{title:L('قهوه'),text:L('اسپرسو و نوشیدنی‌های قهوه؛ انتخاب امروز را از کافه بپرسید.')},{title:L('نوشیدنی‌های سرد و گرم'),text:L('برای همراهی با صبحانه یا یک قرار کوتاه.')},{title:L('کیک و دسر'),text:L('برای یک پایان شیرین؛ موجودی روز را بپرسید.')}]}),cta()]],
 ['about','داستان ما',[head('یک میز، یک فنجان، یک حالِ خوب'),imageText('اینجا کافه محمد است','کافه محمد، صبحانه‌خوری و کافه‌ای در مرودشت؛ جایی برای صبحانه‌های ایرانی و انگلیسی، قهوه و گفت‌وگو.\n\nکیفیت، وظیفهٔ ماست.',photos[1].url),cta()]],
 ['gallery','قاب‌های کافه',[head('طعم و حال‌وهوا، در یک قاب','تصاویر این صفحه از پیج رسمی کافه محمد انتخاب شده‌اند.'),gallery(),cta()]],
 ['reservation','درخواست رزرو میز',[head('برای دورهمی‌تان هماهنگ کنیم','ثبت فرم به‌معنای رزرو قطعی نیست؛ تأیید نهایی با تماس کافه انجام می‌شود.'),section('contact-form',{heading:L('درخواست رزرو میز'),intro:L('روز، ساعت و تعداد مهمان‌ها را بنویسید. برای رزرو نزدیک، لطفاً تلفنی هماهنگ کنید.'),requestType:'reservation',formType:'reservation',showDetails:true,submitLabel:L('ثبت درخواست رزرو')})]],
 ['contact','تماس و نشانی',[head('راهِ کافه محمد از اینجاست'),section('rich-text',{heading:L('منتظر دیدارتان هستیم'),body:L(contactText),buttons:[B('تماس با تلفن کافه','tel:07143230965'),B('تماس با موبایل','tel:09359620043','secondary'),B('اینستاگرام کافه','https://www.instagram.com/cafe_mohammad_/','link')]}),section('contact-form',{heading:L('پیامی برای کافه'),intro:L('سؤال یا پیشنهادتان را اینجا بنویسید.'),requestType:'contact',formType:'contact',showDetails:false})]],
 ['faq','پرسش‌های متداول',[head('پیش از آمدن به کافه'),section('faq',{items:[{question:L('کافه کجاست؟'),answer:L(settings.contact.address.fa)},{question:L('ساعت فعالیت کافه چیست؟'),answer:L('طبق بیوی پیج، ۷ صبح تا ۸ شب. برای روزهای تعطیل تلفنی هماهنگ کنید.')},{question:L('ارسال دارید؟'),answer:L('در بیوی کافه، ارسال در سراسر مرودشت اعلام شده است؛ هزینه و زمان را تلفنی بپرسید.')},{question:L('قیمت‌های منو کجاست؟'),answer:L('قیمت‌ها هنوز در این نسخه ثبت نشده‌اند. برای قیمت و موجودی امروز تماس بگیرید.')},{question:L('رزرو آنلاین قطعی است؟'),answer:L('خیر؛ فرم فقط درخواست هماهنگی است و پس از تأیید کافه قطعی می‌شود.')}]}),cta()]]
];
pages.find(p=>p[0]==='menu')[2]=(await menuDocument(api,root)).sections;
const current=await api(root+'/pages');
for (const [slug,title,sections] of pages) {
 const body={slug,title:L(title,slug==='home'?'Home':slug),isHome:slug==='home',position:pages.findIndex(p=>p[0]===slug),document:{schemaVersion:1,sections}};
 const old=current.find(p=>p.slug===slug);
 const page=await api(root+'/pages'+(old?'/'+old.id:''),old?'PATCH':'POST',body);
 await api(root+'/pages/'+page.id+'/publish','POST',{}); console.log('Published:',slug);
}
console.log('Preview: http://cafe-mohammad.preview.localhost');

await api('/auth/logout','POST',{});
}
