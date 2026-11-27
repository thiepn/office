// Read-only publication projection of the existing version-1 structured document.
import {validateRich} from './rich-format.js';
import {academicIndex,kindName} from './academic-format.js';
import {researchIndex,sourceText} from './research-format.js';
import {DEFAULT_LAYOUT} from './authoring-format.js';

export const PUBLICATION_TEMPLATES=Object.freeze({
 article:{label:'Academic article',className:'article',options:'11pt',heading:['section','subsection','subsubsection']},
 report:{label:'Research report / thesis',className:'report',options:'12pt',heading:['chapter','section','subsection']},
 notes:{label:'Mathematical lecture notes',className:'article',options:'12pt',heading:['section','subsection','subsubsection']}
});
const escapeMap={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}','<':'\\textless{}','>':'\\textgreater{}'};
export function texText(s){return String(s).replace(/[\u0000-\u001f\u007f]/g,c=>c==='\n'||c==='\t'?' ':'').replace(/[\\{}$&#%_^~<>]/g,c=>escapeMap[c]);}
const cmd=(name,body)=>'\\'+name+'{'+body+'}';
const env=(name,body,opts='')=>'\\begin{'+name+'}'+opts+'\n'+body+'\n\\end{'+name+'}\n';
const key=(prefix,id)=>prefix+':'+id;
const safeCommands=new Set(('frac dfrac tfrac sqrt binom dbinom tbinom overline underline widehat widetilde hat tilde bar vec dot ddot mathbb mathcal mathfrak mathrm mathit mathbf mathsf mathtt boldsymbol operatorname text textbf textit textrm left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle quad qquad enspace thinspace negthinspace sum prod coprod int iint iiint oint lim limsup liminf sup inf max min log ln exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh det dim gcd ker hom deg Pr mod bmod pmod pod alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega partial nabla infty ell hbar imath jmath Re Im emptyset varnothing forall exists nexists neg land lor wedge vee cap cup bigcap bigcup setminus subset subseteq supset supseteq notin in ni le leq ge geq neq ne equiv sim simeq approx cong propto pm mp times div cdot circ bullet ast star oplus otimes odot perp parallel mid nmid to mapsto gets leftarrow rightarrow leftrightarrow Leftarrow Rightarrow Leftrightarrow longrightarrow longleftarrow Longrightarrow Longleftarrow Longleftrightarrow uparrow downarrow overbrace underbrace overset underset stackrel ldots cdots vdots ddots dots angle triangle therefore because boxed color begin end lvert rvert vert lVert rVert Vert langle rangle lceil rceil lfloor rfloor colon iff implies check breve acute grave ring mathring slash smile frown lesssim gtrsim leqslant geqslant subsetneq supsetneq mathop mathbin mathrel mathord mathpunct mathopen mathclose mathinner phantom vphantom hphantom substack').split(' '));
const safeEnvs=new Set(['aligned','alignedat','gathered','split','matrix','pmatrix','bmatrix','Bmatrix','vmatrix','Vmatrix','smallmatrix','cases']);
export function publicationMath(raw){
 // KaTeX-compatible storage is not itself a TeX execution sandbox. Reject rather than
 // pass through unknown commands, TeX comments, token rewriting or arbitrary environments.
 if(typeof raw!=='string'||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f%#$]|\^\^/.test(raw))throw Error('Equation contains unsupported publication tokens.');
 let depth=0;const stack=[];
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='\\'){
   const m=/^[A-Za-z]+/.exec(raw.slice(i+1));
   if(m){const name=m[0];i+=name.length;if(!safeCommands.has(name)||name==='color')throw Error('Unsupported publication equation command: '+name);
    if(name==='begin'||name==='end'){
     const e=/^\{([A-Za-z]+)\}/.exec(raw.slice(i+1));if(!e||!safeEnvs.has(e[1]))throw Error('Unsupported publication equation environment.');
     if(name==='begin')stack.push(e[1]);else if(stack.pop()!==e[1])throw Error('Unbalanced equation environment.');
     i+=e[0].length;
    }
   }else{const next=raw[++i];if(!next||!['\\','{','}','|',',',';',':','!',' ','_','&','%'].includes(next))throw Error('Unsupported publication equation escape.');}
   continue;
  }
  if(c==='{')depth++;else if(c==='}'&&--depth<0)throw Error('Unbalanced publication equation.');
  if(c==='&'&&!stack.length)throw Error('Alignment token outside a math environment.');
 }
 if(depth!==0||stack.length)throw Error('Unbalanced publication equation.');
 return raw;
}
export function exportPublication(rich,{title='Untitled',author='',template='article',abstract=''}={}){
 validateRich(rich);
 if(!Object.hasOwn(PUBLICATION_TEMPLATES,template))throw Error('Unknown publication template.');
 const style=PUBLICATION_TEMPLATES[template],layout=rich.layout??DEFAULT_LAYOUT;
 const targets=academicIndex(rich.content),research=researchIndex(rich.content),warnings=new Set();
 const warn=s=>warnings.add(s);
 const bibliography=()=>research.ordered.length?env('thebibliography',research.ordered.map(id=>'\\bibitem{'+key('cite',id)+'} '+texText(sourceText(research.sources.get(id)))).join('\n'),'{'+research.ordered.length+'}'):'';
 function text(n){
  let s=texText(n.text);
  for(const m of n.marks??[]){
   const name={bold:'textbf',italic:'emph',code:'texttt',strike:'sout',underline:'uline'}[m.type];
   if(name)s=cmd(name,s);
   else if(m.type==='link'){s+=' ('+texText(m.attrs.href)+')';warn('Links are printed as literal URLs.');}
   else if(m.type==='typography')warn('Publication template overrides local typography.');
  }
  return s;
 }
 function walk(n,depth=0){
  const children=()=> (n.content??[]).map(c=>walk(c,depth+1)).join('');
  switch(n.type){
   case 'doc':return children();
   case 'text':return text(n);
   case 'paragraph':{let s=children();if(n.attrs?.officeSpacing)warn('Publication template overrides local line spacing.');const align={left:'flushleft',right:'flushright',center:'center'}[n.attrs?.officeAlign];return (align?env(align,s):s)+'\n\n';}
   case 'heading':return cmd(style.heading[(n.attrs?.level??1)-1],children())+'\n';
   case 'hardBreak':return '\\\\{}\n';
   case 'horizontalRule':return '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n';
   case 'blockquote':return env('quote',children());
   case 'bulletList':return env('itemize',children());
   case 'orderedList':return env('enumerate',(n.attrs?.start>1?'\\setcounter{enum'+['i','ii','iii','iv'][Math.min(3,Math.max(0,Math.floor(depth/2)-1))]+'}{'+(n.attrs.start-1)+'}\n':'')+children());
   case 'listItem':return '\\item '+children();
   case 'codeBlock':return env('quote',cmd('ttfamily','')+(n.content??[]).map(c=>texText(c.text).replace(/ /g,'\\ ')).join('')+'\\par');
   case 'inlineEquation':return '\\('+publicationMath(n.attrs.latex)+'\\)';
   case 'displayEquation':return env(n.attrs.numbered?'equation':'equation*',publicationMath(n.attrs.latex));
   case 'academicBlock':{const {id,kind,label}=n.attrs;const anchor=kind==='proof'?cmd('hypertarget',key('office',id))+'{}':cmd('label',key('office',id));return env(kind,anchor+'\n'+children());}
   case 'academicReference':{const t=targets.get(n.attrs.targetId);if(!t){warn('Unresolved academic reference: '+n.attrs.targetId);return '\\textbf{[Unresolved reference]}';}return t.kind==='proof'?'\\hyperlink{'+key('office',t.id)+'}{'+texText('Proof ['+t.label+']')+'}':kindName(t.kind)+'~'+cmd('ref',key('office',t.id));}
   case 'researchCitation':{const id=n.attrs.sourceId;if(!research.sources.has(id)){warn('Missing citation: '+id);return '\\textbf{[Missing citation]}';}return cmd('cite',key('cite',id));}
   case 'researchCatalog':return ''; // one bibliography at the end, independent of catalogue position
   case 'table':{
    const rows=n.content??[],cols=rows[0]?.content?.length??0;
    if(!cols||cols>12||rows.some(r=>r.content?.length!==cols||r.content.some(c=>(c.attrs?.colspan??1)!==1||(c.attrs?.rowspan??1)!==1)))throw Error('Publication export supports rectangular tables with up to 12 columns; split merged cells first.');
    const body=rows.map(r=>r.content.map(c=>{const s=(c.content??[]).map(p=>{if(p.type!=='paragraph')throw Error('Publication table cells must contain paragraphs.');return (p.content??[]).map(x=>walk(x,depth+1)).join('');}).join('\\newline ');return c.type==='tableHeader'?cmd('textbf',s):s;}).join(' & ')+' \\\\ \\hline').join('\n');
    return env('tabularx','\\hline\n'+body,'{\\linewidth}{|'+('X|'.repeat(cols))+'}');
   }
   default:throw Error('Unsupported publication node: '+n.type);
  }
 }
 const body=walk(rich.content);
 const preamble=[
 '\\documentclass['+style.options+']{'+style.className+'}',
 '\\usepackage{fontspec}', '\\setmainfont{Latin Modern Roman}',
 '\\usepackage['+(layout.paper==='Letter'?'letterpaper':'a4paper')+','+(layout.orientation==='landscape'?'landscape,':'')+'margin='+layout.margin+'mm]{geometry}',
 '\\usepackage{amsmath,amssymb,amsthm}', '\\usepackage{tabularx}', '\\usepackage[normalem]{ulem}', '\\usepackage[hidelinks]{hyperref}',
 '\\newtheorem{theorem}{Theorem}', '\\newtheorem{lemma}[theorem]{Lemma}', '\\newtheorem{proposition}[theorem]{Proposition}', '\\newtheorem{corollary}[theorem]{Corollary}', '\\theoremstyle{definition}', '\\newtheorem{definition}[theorem]{Definition}',
 cmd('title',texText(title)),cmd('author',texText(author)), '\\date{}'
 ].join('\n');
 const front='\\maketitle\n'+(abstract?(style.className==='report'?'\\chapter*{Abstract}\n'+texText(abstract)+'\n':env('abstract',texText(abstract))):'')+(template!=='article'?'\\tableofcontents\n':'');
 return {tex:preamble+'\n\\begin{document}\n'+front+body+'\n'+bibliography()+'\\end{document}\n',warnings:[...warnings]};
}
