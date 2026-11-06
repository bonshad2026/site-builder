const cell=process.argv.includes('--cell');let cookie='',csrf='';
async function api(path,method='GET',body){const r=await fetch('http://127.0.0.1:4000/api/v1'+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const raw=await r.text();const v=raw?JSON.parse(raw):{};if(!r.ok)throw Error('API '+r.status);return v.data;}
try{
 csrf=(await api('/auth/login','POST',{email:cell?process.env.CELL_OPERATOR_EMAIL:'admin',password:cell?process.env.CELL_OPERATOR_PASSWORD:process.env.CONTROL_ADMIN_PASSWORD||'123456'})).csrfToken;
 const root='/sites/cafe-mohammad';const pages=(await api(root+'/pages')).filter(p=>['menu','products'].includes(p.slug));
 const docs=[];for(const page of pages){const detail=await api(root+'/pages/'+page.id);if(detail.hasUnpublishedChanges)throw Error('Unpublished page changes need review: '+page.slug);docs.push(detail);}
 const s=await api(root+'/settings');s.shopPage={...s.shopPage,layout:'category-rows',showCategoryFilter:false,showSort:false,showCount:false,card:{...s.shopPage.card,showAddToCart:true}};await api(root+'/settings','PUT',s);
 for(const page of docs){if(!page.document.sections.some(s=>s.type==='products'))continue;const document={...page.document,sections:page.document.sections.map(s=>s.type==='products'?{...s,props:{...s.props,layout:'horizontal'}}:s)};await api(root+'/pages/'+page.id,'PATCH',{document});await api(root+'/pages/'+page.id+'/publish','POST',{});}
 console.log('Enabled category rows and compact horizontal menu sections without changing catalog items.');
}finally{if(csrf)await api('/auth/logout','POST',{});}
