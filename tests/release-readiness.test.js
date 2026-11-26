import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchHubSource,replacements,HUB_PIN,HUB_BLOB} from '../integrations/hub/prepare-export.mjs';
test('prepared Hub integration pins exact source and rejects modified input',()=>{
 assert.match(HUB_PIN,/^[a-f0-9]{40}$/);assert.match(HUB_BLOB,/^[a-f0-9]{40}$/);
 assert.throws(()=>patchHubSource(replacements.map(x=>x[0]).join('\n')),/pinned blob/);
 assert.ok(replacements.some(([,v])=>v.includes('ticket!==epoch')&&v.includes('scope!==namespace')));
});
test('release shutdown is non-destructive and production boot remains disabled',async()=>{
 const shutdown=await readFile(new URL('../server/release/disable-office.sql',import.meta.url),'utf8');
 const boot=await readFile(new URL('../assets/boot.js',import.meta.url),'utf8');
 const callback=await readFile(new URL('../assets/callback.js',import.meta.url),'utf8');
 assert.match(shutdown,/update office_private\.release_gate set enabled=false/);
 assert.doesNotMatch(shutdown,/^\s*(drop|delete|truncate)\b/im);
 assert.match(boot,/startOffice\(null\)/);assert.doesNotMatch(callback,/completeCallback\s*\(/);
});
