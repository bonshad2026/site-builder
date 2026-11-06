const cell=process.argv.includes('--cell');let cookie='',csrf='';
async function api(path,method='GET',body){const r=await fetch('http://127.0.0.1:4000/api/v1'+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const raw=await r.text();const v=raw?JSON.parse(raw):{};if(!r.ok)throw Error('API '+r.status);return v.data;}
try {
 csrf=(await api('/auth/login','POST',{email:cell?process.env.CELL_OPERATOR_EMAIL:'admin',password:cell?process.env.CELL_OPERATOR_PASSWORD:process.env.CONTROL_ADMIN_PASSWORD||'123456'})).csrfToken;
 const root='/sites/cafe-mohammad/settings'; const s=await api(root);
 const link=(fa,en,href,icon)=>({label:{fa,en},href,icon});
 s.header={...s.header,mobileNavigation:'bottom',mobileLinks:[link('خانه','Home','/','home'),link('منوی کافه','Cafe menu','/products','coffee'),link('سبد خرید','Cart','/cart','bag'),link('حساب من','Account','/account','user')]};
 await api(root,'PUT',s);
 const saved=await api(root); if(saved.header.mobileNavigation!=='bottom'||saved.header.mobileLinks.length!==4)throw Error('Settings did not persist');
 console.log('Cafe bottom navigation enabled with four links.');
}finally{if(csrf)await api('/auth/logout','POST',{});}
