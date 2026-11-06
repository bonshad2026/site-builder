import fs from 'node:fs';
const cell=process.argv.includes('--cell');let cookie='',csrf='';
if(cell)process.loadEnvFile('/tmp/instagram-sender.env');
async function api(path,method='GET',body){
const r=await fetch('http://127.0.0.1:4000/api/v1'+path,{method,headers:{Cookie:cookie,'x-csrf-token':csrf,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const v=await r.json();if(!r.ok)throw Error('API status '+r.status+' '+(v.error?.code||''));return v.data;
}
try{
 const login=await api('/auth/login','POST',{email:cell?process.env.CELL_OPERATOR_EMAIL:'admin',password:cell?process.env.CELL_OPERATOR_PASSWORD:'123456'});csrf=login.csrfToken;
 const root='/sites/cafe-mohammad';const settings=await api(root+'/settings');
 settings.accounts={...settings.accounts,enabled:true,identifier:'phone',passwords:true,signupVerification:false};
 settings.shop={...settings.shop,orderMode:'instagram',instagramUsername:'_mehdi__hamze',showPrices:false,shipping:[],checkout:{...settings.shop.checkout,email:'off',address:'required',postalCode:'off',region:false,fields:[]}};
 settings.header={...settings.header,showCart:true,showAccount:true};await api(root+'/settings','PUT',settings);
 if(cell){await api(root+'/orders/instagram-connection','PUT',{username:process.env.INSTAGRAM_USERNAME,password:process.env.INSTAGRAM_PASSWORD});await api(root+'/orders/instagram-connection','POST',{action:'login'});}
 console.log('Configured account-based Instagram ordering'+(cell?' and requested sender login':''));
} catch(error){console.error(error.message);process.exitCode=1;}finally{
 if(csrf)await api('/auth/logout','POST',{}).catch(()=>{});
 if(cell)fs.unlinkSync('/tmp/instagram-sender.env');
}
