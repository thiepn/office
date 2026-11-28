// Source-only candidate. Not imported by the production entry points or guest release.
export const OFFICE_ORIGIN='https://office.thiepn.dev';
export const OFFICE_ISSUER='https://hycegznamzjhwinegaai.supabase.co';
export const OFFICE_CALLBACK=OFFICE_ORIGIN+'/auth/callback/';
export const OFFICE_ACCOUNT_PERMISSIONS='https://account.thiepn.dev/';
export function validateConnectedConfig(input,origin){
 const keys=['issuer','redirectUri','clientId','publishableKey'];
 if(!input||Object.keys(input).sort().join('|')!==keys.sort().join('|')||origin!==OFFICE_ORIGIN||input.issuer!==OFFICE_ISSUER||input.redirectUri!==OFFICE_CALLBACK||
   typeof input.clientId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.clientId)||
   typeof input.publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{20,256}$/.test(input.publishableKey))throw Error('Office connected release configuration is not valid.');
 return Object.freeze({...input});
}
// A later separately authorized build must pass immutable reviewed config and explicitly wire this module.
// No query parameters, localStorage, remote config, or public UI switch can activate this source.
export async function startConnectedCandidate({config,location,createRuntime,startOffice,showBootError}){
 try{
  const validated=validateConnectedConfig(config,location.origin);
  if(location.pathname!=='/'&&location.pathname!=='/docs/')throw Error('Unexpected Office entry route.');
  const runtime=createRuntime(validated);
  // Guest-first: existing app verifies identity before opening the private workspace.
  // No automatic redirect or identity assertion from the configuration itself.
  await startOffice(runtime);
 }catch{showBootError(Error('Office Account configuration or workspace unavailable.'));}
}
export async function finishConnectedCandidate({config,location,history,createRuntime,showStatus}){
 try{
  const validated=validateConnectedConfig(config,location.origin);
  if(location.pathname!=='/auth/callback/')throw Error('Unexpected Office callback route.');
  const runtime=createRuntime(validated);
  const result=await runtime.completeCallback(location);
  history.replaceState(null,'','/auth/callback/');
  if(result?.status!=='signed-in'){showStatus('Account connection could not be verified. Return to the guest workspace.');return false;}
  location.replace('/?workspace=account');
  return true;
 }catch{
  // Do not log authorization codes, error detail, tokens or return URL.
  if(location.origin===OFFICE_ORIGIN&&location.pathname==='/auth/callback/')history.replaceState(null,'','/auth/callback/');
  showStatus('Account connection could not be verified. Return to the guest workspace.');
  return false;
 }
}
