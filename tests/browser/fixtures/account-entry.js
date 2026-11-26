// TEST ONLY. Served on the disposable Playwright loopback origin.
import {startOffice,showBootError} from '/assets/app.js';
import {createOfficeAccountRuntime} from '/assets/account-bundle.js';
if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Synthetic Account fixture is loopback-only.');
const issuer='https://hycegznamzjhwinegaai.supabase.co';
const config={issuer,publishableKey:'fixture-publishable-key-not-real',clientId:'c0000000-0000-4000-8000-000000000001',redirectUri:location.origin+'/auth/callback/'};
const A='a0000000-0000-4000-8000-000000000001',B='a0000000-0000-4000-8000-000000000002';
const key='thiepn:office:oauth:v1:tokens';
const mode=()=>localStorage.getItem('office-fixture-mode')??'online';
const who=()=>localStorage.getItem('office-fixture-owner')??A;
const token=()=>({access_token:'fixture-access-token-for-'+who(),refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',scope:'openid email profile offline_access'});
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function fetcher(url,options={}){
 const parsed=new URL(url);if(parsed.origin!==issuer)throw Error('Unexpected network origin');
 if(mode()==='offline')throw Error('Synthetic network outage');
 if(parsed.pathname==='/auth/v1/oauth/token')return reply(token());
 if(parsed.pathname==='/auth/v1/user'){
  if(mode()==='revoked')return reply({},401);
  if(options.headers.Authorization!=='Bearer '+token().access_token)return reply({},401);
  return reply({id:who(),email:'fixture@example.invalid'});
 }
 const body=JSON.parse(options.body);
 if(body.p_expected_owner!==who())return reply({},403);
 if(parsed.pathname.endsWith('/office_sync_push')){
  const op=body.p_operation,storage='office-fixture-cloud:'+who()+':'+op.doc.id,receipt='office-fixture-receipt:'+who()+':'+op.id;
  const old=localStorage.getItem(receipt);if(old)return reply(JSON.parse(old));
  const current=JSON.parse(localStorage.getItem(storage)??'null');
  const res=mode()==='conflict'?{status:'conflict',operationId:op.id,document:{...op.doc,body:'Synthetic remote copy'}}:current?.revision!==op.expected&&!(current===null&&op.expected===null)?{status:'conflict',operationId:op.id,document:current}:{status:'applied',operationId:op.id,revision:op.doc.revision};
  if(res.status==='applied')localStorage.setItem(storage,JSON.stringify(op.doc));localStorage.setItem(receipt,JSON.stringify(res));return reply(res);
 }
 if(parsed.pathname.endsWith('/office_sync_read'))return reply(JSON.parse(localStorage.getItem('office-fixture-cloud:'+who()+':'+body.p_document_id)??'null'));
 throw Error('Unexpected fixture request');
}
const runtime=createOfficeAccountRuntime(config,{session:{fetch:fetcher},fetcher,sso:{navigate:url=>{const auth=new URL(url);sessionStorage.setItem('office-fixture-authorize',url);location.assign('/auth/callback/?code=fixture-code&state='+encodeURIComponent(auth.searchParams.get('state')));}}});
window.officeFixture={setMode(v){localStorage.setItem('office-fixture-mode',v);window.dispatchEvent(new Event('focus'));},setOwner(v){localStorage.setItem('office-fixture-owner',v==='B'?B:A);localStorage.setItem(key,JSON.stringify({accessToken:token().access_token,refreshToken:'fixture-refresh-token',expiresAt:Date.now()+3600000,scope:'openid email profile offline_access'}));window.dispatchEvent(new Event('storage'));}};
if(location.pathname==='/auth/callback/'){const identity=await runtime.completeCallback(location);history.replaceState(null,'',location.pathname);if(identity.status==='signed-in')location.replace('/?workspace=account');else document.querySelector('#callback-state').textContent='Synthetic callback rejected';}
else await startOffice(runtime).catch(showBootError);
