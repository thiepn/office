// O3.1: a deliberately bounded, lossless Markdown bridge.
// No stored HTML, no HTML parsing, no schema/database migration.
const unsupported=()=>new Error('This formatting is not supported in visual mode. Use Markdown source for advanced syntax.');
function plain(text){
 if (/[\x00-\x08\x0b-\x1f*_\x60\\<>\[\]~|]/u.test(text)||/&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(text))throw unsupported();
 return text;
}
function inline(doc,text){
 const frag=doc.createDocumentFragment();
 const tokens=/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\x60([^\x60\n]+)\x60/g;
 let end=0;
 for(const m of text.matchAll(tokens)){
  frag.append(doc.createTextNode(plain(text.slice(end,m.index))));
  const tag=m[1]!==undefined?'strong':m[2]!==undefined?'em':'code',value=m[1]??m[2]??m[3];
  if(!value.trim()||value.trim()!==value)throw unsupported();
  const n=doc.createElement(tag);n.textContent=tag==='code'?value:plain(value);frag.append(n);end=m.index+m[0].length;
 }
 frag.append(doc.createTextNode(plain(text.slice(end))));return frag;
}
function block(doc,tag,text){
 const n=doc.createElement(tag);n.append(inline(doc,text));if(!text)n.append(doc.createElement('br'));return n;
}
export function markdownToVisual(doc,source){
 if(source.length>200000||source.includes('\r'))throw unsupported();
 const frag=doc.createDocumentFragment();
 for(const chunk of source.split('\n\n')){
  if(!chunk){frag.append(block(doc,'p',''));continue;}
  const lines=chunk.split('\n');
  if(lines.every(s=>s.startsWith('- ')&&s.length>2)){
   const list=doc.createElement('ul');for(const line of lines)list.append(block(doc,'li',line.slice(2)));frag.append(list);continue;
  }
  if(lines.every((s,i)=>s.startsWith((i+1)+'. ')&&s.length>((i+1)+'. ').length)){
   const list=doc.createElement('ol');for(const [i,line] of lines.entries())list.append(block(doc,'li',line.slice(((i+1)+'. ').length)));frag.append(list);continue;
  }
  if(lines.length!==1||chunk.trim()!==chunk)throw unsupported();
  const heading=/^(#{1,3}) (.+)$/.exec(chunk);
  if(heading){frag.append(block(doc,'h'+heading[1].length,heading[2]));continue;}
  if(chunk.startsWith('> ')&&chunk.length>2){frag.append(block(doc,'blockquote',chunk.slice(2)));continue;}
  if(/^(?:#|>|[-+]\s|\d+[.)]\s|---|===|!\[)/.test(chunk))throw unsupported();
  frag.append(block(doc,'p',chunk));
 }
 return frag;
}
function inlineNode(n){
 if(n.nodeType===3)return plain(n.nodeValue);
 if(n.nodeType!==1)throw unsupported();
 const tag=n.tagName;
 if(n.attributes.length)throw unsupported();
 if(tag==='BR')throw unsupported();
 if(tag==='CODE'){
  const value=n.textContent;if(n.children.length||!value||value.trim()!==value||/[\x60\r\n]/.test(value))throw unsupported();
  return '\x60'+value+'\x60';
 }
 const value=Array.from(n.childNodes,inlineNode).join('');
 if(tag==='SPAN')return value;
 if(!value||value.trim()!==value||value.includes('*'))throw unsupported();
 if(tag==='B'||tag==='STRONG')return '**'+value+'**';
 if(tag==='I'||tag==='EM')return '*'+value+'*';
 throw unsupported();
}
function inlineChildren(n){
 const nodes=Array.from(n.childNodes);
 if(nodes.length===1&&nodes[0].nodeName==='BR')return '';
 return nodes.map(inlineNode).join('');
}
function serializeBlock(n){
 if(n.attributes.length)throw unsupported();
 const tag=n.tagName;
 if(tag==='UL'||tag==='OL'){
  if(!n.children.length||Array.from(n.childNodes).some(c=>c.nodeType!==1||c.tagName!=='LI'||c.attributes.length))throw unsupported();
  return Array.from(n.children,(li,i)=>{const t=inlineChildren(li);if(!t||t.trim()!==t)throw unsupported();return (tag==='UL'?'- ':(i+1)+'. ')+t;}).join('\n');
 }
 const value=inlineChildren(n);
 if(value.trim()!==value)throw unsupported();
 if(tag==='P'||tag==='DIV')return value;
 if(/^H[1-3]$/.test(tag)&&value)return '#'.repeat(Number(tag[1]))+' '+value;
 if(tag==='BLOCKQUOTE'&&value)return '> '+value;
 throw unsupported();
}
export function visualToMarkdown(surface){
 const blocks=[];let inlineNodes=[];
 function flush(){if(inlineNodes.length){blocks.push(inlineNodes.map(inlineNode).join(''));inlineNodes=[];}}
 for(const n of surface.childNodes){
  if(n.nodeType===1&&/^(P|DIV|H[1-3]|BLOCKQUOTE|UL|OL)$/.test(n.tagName)){flush();blocks.push(serializeBlock(n));}
  else if(n.nodeType===1&&n.tagName==='BR'){flush();blocks.push('');}
  else inlineNodes.push(n);
 }
 flush();const md=blocks.join('\n\n');
 // A source-level validation pass prevents ambiguous or unsupported output.
 const check=markdownToVisual(surface.ownerDocument,md);
 if(md.length>200000||!check)throw unsupported();
 return md;
}

export function sourceToJSON(doc,source){
 const frag=markdownToVisual(doc,source);
 const wrap=doc.createElement('div');wrap.append(frag);
 if(visualToMarkdown(wrap)!==source)throw unsupported();
 function texts(n,marks=[]){
  if(n.nodeType===3)return n.nodeValue?[{type:'text',text:n.nodeValue,...(marks.length?{marks}: {})}]:[];
  if(n.tagName==='BR')return [];
  const mark={STRONG:'bold',B:'bold',EM:'italic',I:'italic',CODE:'code'}[n.tagName];
  return Array.from(n.childNodes,c=>texts(c,mark?[...marks,{type:mark}]:marks)).flat();
 }
 function para(n){return {type:'paragraph',content:Array.from(n.childNodes,c=>texts(c)).flat()};}
 function blockJSON(n){
  if(/^H[1-3]$/.test(n.tagName))return {...para(n),type:'heading',attrs:{level:Number(n.tagName[1])}};
  if(n.tagName==='BLOCKQUOTE')return {type:'blockquote',content:[para(n)]};
  if(n.tagName==='UL'||n.tagName==='OL')return {type:n.tagName==='UL'?'bulletList':'orderedList',...(n.tagName==='OL'?{attrs:{start:1}}:{}),content:Array.from(n.children,li=>({type:'listItem',content:[para(li)]}))};
  return para(n);
 }
 return {type:'doc',content:Array.from(wrap.children,blockJSON)};
}
export function jsonToSource(doc,json){
 function inline(n){
  if(n.type!=='text')throw unsupported();
  let t=n.text;
  if(!n.marks?.length)return plain(t);
  if(n.marks.length!==1)throw unsupported();
  if(!t||t.trim()!==t)throw unsupported();
  switch(n.marks[0].type){case 'bold':return '**'+plain(t)+'**';case 'italic':return '*'+plain(t)+'*';case 'code':if(/[\x60\n\r]/.test(t))throw unsupported();return '\x60'+t+'\x60';default:throw unsupported();}
 }
 const p=n=>(n.content??[]).map(inline).join('');
 function block(n){
  if(n.type==='paragraph')return p(n);
  if(n.type==='heading'&&[1,2,3].includes(n.attrs?.level))return '#'.repeat(n.attrs.level)+' '+p(n);
  if(n.type==='blockquote'&&n.content?.length===1&&n.content[0].type==='paragraph')return '> '+p(n.content[0]);
  if(n.type==='bulletList'||n.type==='orderedList'){
   if(n.type==='orderedList'&&n.attrs?.start!==1)throw unsupported();
   return n.content.map((item,i)=>{if(item.type!=='listItem'||item.content?.length!==1||item.content[0].type!=='paragraph')throw unsupported();return (n.type==='bulletList'?'- ':(i+1)+'. ')+p(item.content[0]);}).join('\n');
  }
  throw unsupported();
 }
 const source=json.content.map(block).join('\n\n');
 sourceToJSON(doc,source);
 return source;
}
