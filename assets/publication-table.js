// Build a rectangular occupancy grid before emitting TeX. Never duplicate cell content.
export function publicationTable(table,render,warn=()=>{}){
 const rows=table.content??[];
 if(!rows.length||rows.length>500)throw Error('Publication table row limit exceeded.');
 const grid=Array.from(rows,()=>[]);let cols=0;
 for(let r=0;r<rows.length;r++){
  if(rows[r].type!=='tableRow')throw Error('Invalid publication table row.');
  let c=0;
  for(const cell of rows[r].content??[]){
   if(!['tableCell','tableHeader'].includes(cell.type))throw Error('Invalid publication table cell.');
   while(grid[r][c])c++;
   const w=cell.attrs?.colspan??1,h=cell.attrs?.rowspan??1;
   if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||c+w>12||r+h>rows.length)throw Error('Invalid publication table span or column limit (12).');
   const entry={r,c,w,h,cell};
   for(let y=r;y<r+h;y++)for(let x=c;x<c+w;x++){
    if(grid[y][x])throw Error('Overlapping publication table spans.');
    grid[y][x]=entry;
   }
   c+=w;cols=Math.max(cols,c);
  }
 }
 if(!cols||grid.some(row=>row.length!==cols||Array.from({length:cols},(_,i)=>row[i]).some(v=>!v)))throw Error('Publication table is not rectangular.');
 // Fixed p widths avoid tabularx trial passes re-executing labels and equation counters.
 const unit='\\dimexpr\\linewidth/'+cols+'-2\\tabcolsep-\\arrayrulewidth-'+(cols===1?'\\arrayrulewidth':'\\arrayrulewidth/'+cols)+'\\relax';
 const spanWidth=w=>'\\dimexpr'+w+'\\linewidth/'+cols+'-2\\tabcolsep-2\\arrayrulewidth\\relax';
 const spec=(w,align='left')=>'>{\\'+({left:'raggedright',center:'centering',right:'raggedleft'}[align]??'raggedright')+'\\arraybackslash}p{'+(w===1?unit:spanWidth(w))+'}';
 const lines=['\\hline'];
 for(let r=0;r<grid.length;r++){
  const cells=[];
  for(let c=0;c<cols;){
   const e=grid[r][c];if(e.c!==c)throw Error('Invalid publication table span.');
   let body='';
   if(e.r===r){
    const blocks=e.cell.content??[];
    // Block headings change global section counters; nested tables cannot reliably paginate.
    if(blocks.some(n=>['heading','table'].includes(n.type)))throw Error('Publication table cells do not support headings or nested tables.');
    const parts=blocks.map(render);
    body=parts.join('').trimEnd();
    if(e.cell.type==='tableHeader')body='{\\bfseries '+body+'}';
    if(e.cell.attrs?.colwidth?.some(x=>x>0))warn('Publication tables use equal column widths; editor pixel widths are not preserved.');
    if(e.h>1)body='\\multirow[t]{'+e.h+'}{'+(e.w===1?unit:spanWidth(e.w))+'}{'+body+'}';
   }
   // Keep the same combined width in continuation rows, including horizontal spans.
   if(e.w>1||e.cell.attrs?.align)body='\\multicolumn{'+e.w+'}{|'+spec(e.w,e.cell.attrs?.align)+'|}{'+body+'}';
   cells.push(body);c+=e.w;
  }
  let rule='';
  if(r===grid.length-1)rule='\\hline';
  else{
   for(let c=0;c<cols;){
    if(grid[r][c]===grid[r+1][c]){c++;continue;}
    const first=c++;while(c<cols&&grid[r][c]!==grid[r+1][c])c++;
    rule+='\\cline{'+(first+1)+'-'+c+'}';
   }
  }
  lines.push(cells.join(' & ')+' \\\\ '+rule);
 }
 return '\\par\\noindent\\begin{tabular}{|'+Array(cols).fill(spec(1)).join('|')+'|}\n'+lines.join('\n')+'\n\\end{tabular}\\par\n';
}
