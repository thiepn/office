// Dedicated integration fixture: same shared SDK, real isolated PostgreSQL RPCs.
import {startOffice,showBootError} from '/assets/app.js';
import {createOfficeAccountRuntime} from '/assets/account-bundle.js';
if(location.origin!=='http://127.0.0.1:8000')throw Error('Loopback only.');
const device=sessionStorage.getItem('office-integration-device');
if(!['device-a','device-b','other-owner'].includes(device))throw Error('Missing test device.');
const owner='a0000000-0000-4000-8000-00000000000'+(device==='other-owner'?2:1);
const issuer='https://hycegznamzjhwinegaai.supabase.co';
const config={issuer,publishableKey:'fixture-publishable-key-not-real',clientId:'c0000000-0000-4000-8000-000000000001',redirectUri:location.origin+'/auth/callback/'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const token=()=>({access_token:device,refresh_token:'fixture-refresh-'+device,expires_in:3600,token_type:'bearer',scope:'openid email profile offline_access'});
async function fetcher(url,options={}){
 const parsed=new URL(url);if(parsed.origin!==issuer)throw Error('Unexpected origin');
 if(sessionStorage.getItem('office-integration-offline')==='1')throw Error('Simulated network loss');
 if(parsed.pathname==='/auth/v1/oauth/token')return reply(token());
 if(parsed.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer '+device?reply({id:owner,email:'fixture@example.invalid'}):reply({},401);
 const name=parsed.pathname.split('/').at(-1);
 if(!['office_sync_push','office_sync_read','office_sync_manifest'].includes(name))throw Error('Unexpected RPC');
 const response=await fetch('/__office_test_rpc',{method:'POST',headers:{'Content-Type':'application/json',Authorization:options.headers.Authorization},body:JSON.stringify({name,args:JSON.parse(options.body)}),signal:options.signal});
 if(name==='office_sync_push'&&response.ok&&sessionStorage.getItem('office-integration-drop')==='1'){
  // The server has committed before this response is discarded.
  await response.json();sessionStorage.removeItem('office-integration-drop');throw Error('Simulated lost commit acknowledgement');
 }
 return response;
}
const runtime=createOfficeAccountRuntime(config,{session:{fetch:fetcher},fetcher,sso:{navigate:url=>{const auth=new URL(url);location.assign('/auth/callback/?code=fixture-code&state='+encodeURIComponent(auth.searchParams.get('state')));}}});
if(location.pathname==='/auth/callback/'){
 const identity=await runtime.completeCallback(location);history.replaceState(null,'',location.pathname);
 if(identity.status==='signed-in')location.replace('/?workspace=account');else document.querySelector('#callback-state').textContent='Synthetic callback rejected';
}else await startOffice(runtime).catch(showBootError);
