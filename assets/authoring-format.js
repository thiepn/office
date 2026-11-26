// Closed vocabularies: no arbitrary CSS or user-provided style strings.
export const FONTS=Object.freeze({serif:'Georgia, serif',sans:'Arial, sans-serif',mono:'ui-monospace, monospace'});
export const SIZES=Object.freeze([10,12,14,16,18,20,24,28,32]);
export const COLORS=Object.freeze({ink:'#202820',blue:'#174b9b',red:'#a12625',green:'#225d49',purple:'#693993'});
export const ALIGN=Object.freeze(['left','center','right','justify']);
export const SPACING=Object.freeze([1,1.25,1.5,1.75,2]);
export const DEFAULT_LAYOUT=Object.freeze({paper:'A4',orientation:'portrait',margin:20});
export function validTypography(a){
 return !!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>['font','size','color'].includes(k))&&
 (a.font==null||Object.hasOwn(FONTS,a.font))&&(a.size==null||SIZES.includes(a.size))&&(a.color==null||Object.hasOwn(COLORS,a.color));
}
export function validateLayout(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==3||!['A4','Letter'].includes(a.paper)||!['portrait','landscape'].includes(a.orientation)||![12,20,25,30].includes(a.margin))throw new Error('Invalid page layout.');
 return a;
}
export function pageWidth(a){return (a.paper==='A4'?(a.orientation==='portrait'?210:297):(a.orientation==='portrait'?215.9:279.4));}
