// Versioned structured document envelope; original source remains immutable.
export const RICH_VERSION=1;
const nodes=new Set(['doc','paragraph','text','heading','blockquote','bulletList','orderedList','listItem','codeBlock','hardBreak','horizontalRule','table','tableRow','tableHeader','tableCell']);
const marks=new Set(['bold','italic','code','strike','underline','link']);
export function safeLink(value){
 if(typeof value!=='string'||value.length>2048||/[\s\x00-\x1f]/u.test(value))return false;
 try{const u=new URL(value);return ['https:','http:','mailto:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
}
export function validateRich(rich){
 if(!rich||rich.version!==1||typeof rich.originalMarkdown!=='string'||rich.originalMarkdown.length>200000||rich.content?.type!=='doc')throw new Error('Unsupported structured document format.');
 let count=0,text=0;
 function visit(n,depth){
  if(!n||!nodes.has(n.type)||depth>40||++count>30000||Object.keys(n).some(k=>!['type','attrs','marks','content','text'].includes(k)))throw new Error('Invalid structured document node.');
  if(n.attrs!==undefined){
   if(!n.attrs||typeof n.attrs!=='object'||Array.isArray(n.attrs))throw new Error('Invalid node attributes.');
   for(const [k,v] of Object.entries(n.attrs)){
    if(n.type==='heading'&&k==='level'&&Number.isInteger(v)&&v>=1&&v<=3)continue;
    if(n.type==='orderedList'&&k==='start'&&Number.isInteger(v)&&v>=1&&v<=100000)continue;
    if(n.type==='orderedList'&&k==='type'&&v===null)continue;
    if(n.type==='codeBlock'&&k==='language'&&(v===null||typeof v==='string'&&/^[a-zA-Z0-9_+-]{0,40}$/.test(v)))continue;
    if(['tableCell','tableHeader'].includes(n.type)&&['colspan','rowspan'].includes(k)&&Number.isInteger(v)&&v>=1&&v<=100)continue;
    if(['tableCell','tableHeader'].includes(n.type)&&k==='colwidth'&&(v===null||Array.isArray(v)&&v.length<=100&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=5000)))continue;
    if(['tableCell','tableHeader'].includes(n.type)&&k==='align'&&[null,'left','center','right'].includes(v))continue;
    throw new Error('Unsupported node attribute.');
   }
  }
  if(n.type==='text'){if(typeof n.text!=='string'||!n.text.length||n.content)throw new Error('Invalid text node.');text+=n.text.length;}
  else if(n.text!==undefined)throw new Error('Unexpected text.');
  if(n.marks!==undefined){
   if(!Array.isArray(n.marks)||n.type!=='text'||n.marks.length>6)throw new Error('Invalid marks.');
   for(const m of n.marks){
    if(!m||!marks.has(m.type)||Object.keys(m).some(k=>!['type','attrs'].includes(k)))throw new Error('Unsupported mark.');
    if(m.type==='link'){
     const a=m.attrs;if(!a||!safeLink(a.href)||Object.keys(a).some(k=>!['href','target','rel','class','title'].includes(k))||![undefined,null,'_blank'].includes(a.target)||![undefined,null,'noopener noreferrer','noopener noreferrer nofollow'].includes(a.rel)||![undefined,null].includes(a.class)||![undefined,null].includes(a.title))throw new Error('Unsafe link.');
    }else if(m.attrs&&Object.keys(m.attrs).length)throw new Error('Unsupported mark attributes.');
   }
  }
  if(n.content!==undefined){if(!Array.isArray(n.content))throw new Error('Invalid content.');for(const c of n.content)visit(c,depth+1);}
 }
 visit(rich.content,0);
 if(text>200000||JSON.stringify(rich).length>1000000)throw new Error('Structured document exceeds storage limit.');
 return rich;
}
export function richText(node){return node.type==='text'?node.text:(node.content??[]).map(richText).join(node.type==='paragraph'||node.type==='heading'?'':' ');}
