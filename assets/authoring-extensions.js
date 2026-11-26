import {Mark,Extension} from '@tiptap/core';
import {FONTS,SIZES,COLORS,ALIGN,SPACING,validTypography} from './authoring-format.js';
// Render only trusted constant styles. Import uses schema-checked JSON, not HTML.
export const Typography=Mark.create({
 name:'typography',
 addAttributes(){return {font:{default:null},size:{default:null},color:{default:null}};},
 parseHTML(){return [{tag:'span[data-office-typography]',getAttrs:el=>{const a={font:el.dataset.officeFont||null,size:el.dataset.officeSize?Number(el.dataset.officeSize):null,color:el.dataset.officeColor||null};return validTypography(a)?a:false;}}];},
 renderHTML({mark}){const a=mark.attrs,attrs={'data-office-typography':''},styles=[];
  if(a.font&&Object.hasOwn(FONTS,a.font)){attrs['data-office-font']=a.font;styles.push('font-family:'+FONTS[a.font]);}
  if(SIZES.includes(a.size)){attrs['data-office-size']=String(a.size);styles.push('font-size:'+a.size+'pt');}
  if(a.color&&Object.hasOwn(COLORS,a.color)){attrs['data-office-color']=a.color;styles.push('color:'+COLORS[a.color]);}
  if(styles.length)attrs.style=styles.join(';');return ['span',attrs,0];
 }
});
export const ParagraphStyle=Extension.create({
 name:'officeParagraphStyle',
 addGlobalAttributes(){return [{types:['paragraph','heading'],attributes:{
  officeAlign:{default:null,parseHTML:el=>ALIGN.includes(el.dataset.officeAlign)?el.dataset.officeAlign:null,renderHTML:a=>ALIGN.includes(a.officeAlign)?{'data-office-align':a.officeAlign,style:'text-align:'+a.officeAlign}:{}},
  officeSpacing:{default:null,parseHTML:el=>SPACING.includes(Number(el.dataset.officeSpacing))?Number(el.dataset.officeSpacing):null,renderHTML:a=>SPACING.includes(a.officeSpacing)?{'data-office-spacing':String(a.officeSpacing),style:'line-height:'+a.officeSpacing}:{}}
 }}];}
});
