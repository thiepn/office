const id=n=>'ab000000-0000-4000-8000-'+String(n).padStart(12,'0');
const text=s=>({type:'text',text:s}),p=(...content)=>({type:'paragraph',content});
const ref=n=>({type:'academicReference',attrs:{targetId:id(n)}}),cite=n=>({type:'researchCitation',attrs:{sourceId:id(n)}}),block=(n,kind,label)=>({type:'academicBlock',attrs:{id:id(n),kind,label},content:[p(text('A result.'))]});
const src=n=>({id:id(n),key:'source'+n,type:'article',fields:{title:'Paper '+n,author:'Ada & Bob',year:'2026'}});
export const fixture={version:1,originalMarkdown:'Original',content:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[text('Introduction')]},p(text('A & B: '),ref(1),cite(4),cite(3)),block(1,'theorem','thm:original'),block(2,'proof','proof:one'),{type:'displayEquation',attrs:{latex:'\\frac{1}{2}=0.5',numbered:true}},{type:'displayEquation',attrs:{latex:'x^2',numbered:false}},p(text('Proof: '),ref(2),cite(4)),{type:'researchCatalog',attrs:{sources:[src(3),src(4),src(5)]}}]}};
