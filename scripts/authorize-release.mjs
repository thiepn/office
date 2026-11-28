import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const requiredWorkflows=['Office quality','Office isolated PostgreSQL','Office two-device PostgreSQL integration'];
export function authorizeEvidence({sha,dispatchSha,branch,actor,triggeringActor,confirmation,mainSha,runs}){
 if(!/^[a-f0-9]{40}$/.test(sha??'')||sha!==dispatchSha||sha!==mainSha||branch!=='refs/heads/main'||actor!=='thiepn'||triggeringActor!=='thiepn'||confirmation!=='PREPARE OFFICE GUEST')throw Error('Release authorization mismatch.');
 for(const name of requiredWorkflows){
  const relevant=runs.filter(r=>r.name===name&&r.head_sha===sha&&r.event==='push'&&r.head_branch==='main').sort((a,b)=>b.id-a.id);
  if(!relevant.length||relevant[0].status!=='completed'||relevant[0].conclusion!=='success')throw Error('Missing successful latest main CI: '+name);
 }
 return true;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const e=process.env,sha=e.OFFICE_RELEASE_SHA;
 if(e.GITHUB_REPOSITORY!=='thiepn/office'||!e.GH_TOKEN||!/^[a-f0-9]{40}$/.test(sha??''))throw Error('Missing authorized release context.');
 async function get(path){const r=await fetch('https://api.github.com/repos/thiepn/office'+path,{headers:{Authorization:'Bearer '+e.GH_TOKEN,Accept:'application/vnd.github+json'}});if(!r.ok)throw Error('GitHub evidence unavailable: '+r.status);return r.json();}
 const main=await get('/git/ref/heads/main'), runs=await get('/actions/runs?branch=main&event=push&head_sha='+sha+'&per_page=100');
 if(runs.total_count>100)throw Error('Ambiguous workflow evidence.');
 authorizeEvidence({sha,dispatchSha:e.GITHUB_SHA,branch:e.GITHUB_REF,actor:e.GITHUB_ACTOR,triggeringActor:e.GITHUB_TRIGGERING_ACTOR,confirmation:e.OFFICE_RELEASE_CONFIRMATION,mainSha:main.object.sha,runs:runs.workflow_runs});
 console.log('PASS: exact main release preparation authorized; no deploy permission.');
}
