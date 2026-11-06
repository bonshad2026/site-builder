import {menuDocument} from './menu.mjs';
let cookie='',csrf='';
async function api(path,method='GET',body){const multi=body instanceof FormData;const r=await fetch('http://127.0.0.1:4000/api/v1'+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body&&!multi?{'Content-Type':'application/json'}:{})},body:body?(multi?body:JSON.stringify(body)):undefined});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const raw=await r.text();const value=raw?JSON.parse(raw):{};if(!r.ok)throw Error(JSON.stringify(value));return value.data;}
try{const login=await api('/auth/login','POST',{email:'admin',password:process.env.STUDIO_PASSWORD||'123456'});csrf=login.csrfToken;
const root='/sites/cafe-mohammad';const pages=await api(root+'/pages');const menu=pages.find(p=>p.slug==='menu');if(!menu)throw Error('Cafe menu not found');
const document=await menuDocument(api,root);await api(root+'/pages/'+menu.id,'PATCH',{document});await api(root+'/pages/'+menu.id+'/publish','POST',{});
console.log('Published menu:',document.sections[1].props.items.length,'items in',new Set(document.sections[1].props.items.map(i=>i.category.fa)).size,'categories');
}finally{if(csrf)await api('/auth/logout','POST',{});}
