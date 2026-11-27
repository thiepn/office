// Local/offline reproducible qualification of actual generated publication files.
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {exportPublication,PUBLICATION_TEMPLATES} from '../assets/publication-format.js';
import {fixture} from './publication-fixture.js';
const out=process.argv[2]?resolve(process.argv[2]):mkdtempSync(join(tmpdir(),'office-publication-'));
mkdirSync(out,{recursive:true});
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:90000,maxBuffer:10*1024*1024});if(r.error||r.status!==0)throw Error(command+' failed: '+(r.error??'')+'\n'+r.stdout+'\n'+r.stderr);return r.stdout;}
for(const template of Object.keys(PUBLICATION_TEMPLATES)){
 const dir=join(out,template);mkdirSync(dir,{recursive:true});
 const {tex,warnings}=exportPublication(fixture,{title:'Publication validation',author:'Ada Lovelace',template,abstract:'A reproducible mathematical publication.'});assert.deepEqual(warnings,[]);
 writeFileSync(join(dir,'publication.tex'),tex);
 for(let i=0;i<3;i++)run('xelatex',['-no-shell-escape','-interaction=nonstopmode','-halt-on-error','publication.tex'],dir);
 const log=readFileSync(join(dir,'publication.log'),'utf8');
 assert.doesNotMatch(log,/undefined references|undefined citations|Citation .* undefined|Reference .* undefined|Missing character:|Overfull \\hbox/i);
 assert.ok(existsSync(join(dir,'publication.pdf')));
 const extracted=run('pdftotext',['-layout','publication.pdf','-'],dir);
 for(const phrase of ['Publication validation','Theorem 1','Paper 4','Paper 3'])assert.ok(extracted.includes(phrase),phrase);
 assert.ok(extracted.indexOf('Paper 4')<extracted.indexOf('Paper 3'));assert.match(extracted,/\(1\)/);assert.doesNotMatch(extracted,/\(1\.1\)/);
 run('pdftoppm',['-png','-r','110','publication.pdf','page'],dir);
 console.log('PASS: compiled and rasterized '+template+'; inspect '+dir);
}
