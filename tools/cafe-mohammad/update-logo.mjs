const cell=process.argv.includes('--cell');
const base=cell?'http://127.0.0.1:4000/api/v1':'http://127.0.0.1:4000/api/v1';
let cookie='',csrf='';
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(c=>c.split(';')[0]).join('; ');const raw=await r.text();const value=raw?JSON.parse(raw):{};if(!r.ok)throw Error(`${r.status} ${path}`);return value.data;}
try {
 const login=await api('/auth/login','POST',{email:cell?process.env.CELL_OPERATOR_EMAIL:'admin',password:cell?process.env.CELL_OPERATOR_PASSWORD:(process.env.STUDIO_PASSWORD||'123456')});csrf=login.csrfToken;
 const path='/sites/cafe-mohammad/settings';const settings=await api(path);
 const style='<style id="cafe-round-logo">header a img, footer img { border-radius: 50%; aspect-ratio: 1 / 1; object-fit: cover; }</style>';
 settings.meta={...settings.meta,headCode:(settings.meta?.headCode||'').replace(/<style id="cafe-round-logo">[\s\S]*?<\/style>/g,'')+style};
 await api(path,'PUT',settings);console.log('Cafe header/footer logo style updated');
} finally {if(csrf)await api('/auth/logout','POST',{});}
