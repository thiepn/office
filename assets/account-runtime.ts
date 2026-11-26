import {createThiepnAccountSession,createThiepnBrowserSso} from '../vendor/account-session/src/index';
import {createOfficeTransport} from './sync-contract.js';
// No runtime query parameter, browser storage or remote config can enable production auth.
export const LIVE_ACCOUNT_ENABLED=false;
export function createOfficeAccountRuntime(config:any, adapters:any={}){
 if(!config||config.issuer!=='https://hycegznamzjhwinegaai.supabase.co')throw Error('Invalid Account issuer.');
 const redirect=new URL(config.redirectUri);if(!(redirect.href==='https://office.thiepn.dev/auth/callback/'||(['localhost','127.0.0.1'].includes(redirect.hostname)&&redirect.protocol==='http:'&&redirect.pathname==='/auth/callback/'&&!redirect.search&&!redirect.hash)))throw Error('Invalid Office callback.');
 const session=createThiepnAccountSession({issuer:config.issuer,publishableKey:config.publishableKey,clientId:config.clientId,redirectUri:config.redirectUri,storageKey:'thiepn:office:oauth:v1',authPolicy:'guest-first',...adapters.session});
 const sso=createThiepnBrowserSso(session,{accountOrigin:'https://account.thiepn.dev',...adapters.sso});
 // Deliberately no automatic iframe probe or SSO redirect.
 return {session:sso,transport:createOfficeTransport({session:sso,issuer:config.issuer,publishableKey:config.publishableKey,fetcher:adapters.fetcher}),connect:()=>sso.connect(),completeCallback:(location:any)=>sso.completeCallback(location),disconnect:()=>sso.signOutLocal()};
}
export function liveRuntime(){if(!LIVE_ACCOUNT_ENABLED)return null;throw Error('Office Account configuration not approved.');}
