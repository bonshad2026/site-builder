const cell=process.argv.includes('--cell');let cookie='',csrf='';
async function api(path,method='GET',body){const r=await fetch('http://127.0.0.1:4000/api/v1'+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const raw=await r.text();const v=raw?JSON.parse(raw):{};if(!r.ok)throw Error('API '+r.status);return v.data;}
try{
 csrf=(await api('/auth/login','POST',{email:cell?process.env.CELL_OPERATOR_EMAIL:'admin',password:cell?process.env.CELL_OPERATOR_PASSWORD:process.env.CONTROL_ADMIN_PASSWORD||'123456'})).csrfToken;
 const root='/sites/cafe-mohammad';const home=(await api(root+'/pages')).find(p=>p.isHome);const d=await api(root+'/pages/'+home.id);if(d.hasUnpublishedChanges)throw Error('Unpublished home edits need review');
 const stats=d.document.sections.find(s=>s.type==='stats' && s.props.items.length===3);if(!stats)throw Error('Expected three home stats');
 const document={...d.document,sections:d.document.sections.map(s=>s.id===stats.id?{...s,props:{...s.props,layout:'cards',items:s.props.items.map((v,i)=>({...v,icon:['clock','pin','coffee'][i]}))}}:s)};
 await api(root+'/pages/'+home.id,'PATCH',{document});await api(root+'/pages/'+home.id+'/publish','POST',{});console.log('Published three square home icon cards; texts preserved.');
}finally{if(csrf)await api('/auth/logout','POST',{});}
