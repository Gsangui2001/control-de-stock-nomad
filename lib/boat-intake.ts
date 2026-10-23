import {z} from 'zod';
const short=z.string().trim().max(140), value=z.number().finite().min(0).max(1e9).nullable();
export const intakeKind=z.enum(['count','purchase','expense','request']);
export const intakeData=z.object({
 date:z.string().max(10).default(''),supplier:short.default(''),reference:short.default(''),currency:z.enum(['','USD','EUR','ARS','PAB']).default(''),total:value.default(null),notes:z.string().max(3000).default(''),
 items:z.array(z.object({name:short,quantity:value,unit:z.string().trim().max(20),location:short,area:z.enum(['','gastronomia','tecnica']),unitCost:value.default(null),productId:z.string().max(100).default('')})).max(100)
});
export type IntakeData=z.infer<typeof intakeData>;
export function validateIntakeApply(kind:z.infer<typeof intakeKind>,data:IntakeData){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||new Date(data.date+'T12:00:00Z').toISOString().slice(0,10)!==data.date)throw Error('Completá una fecha válida.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(data.date>today)throw Error('La fecha no puede ser futura.');
 if(kind!=='expense'&&!data.items.length)throw Error('Agregá al menos un producto.');
 for(const row of kind==='expense'?[]:data.items){
  if(!row.name||row.quantity===null||!row.unit||!row.area||(kind!=='request'&&!row.location))throw Error('Completá producto, cantidad, unidad, área y ubicación en cada fila.');
  if(kind!=='count'&&row.quantity===0)throw Error('La cantidad debe ser mayor que cero.');
 }
 if(['purchase','expense'].includes(kind)&&(!data.currency||data.total===null||!data.supplier))throw Error('Para registrar un gasto, confirmá proveedor, moneda e importe total.');
 return data;
}
// Conservative fallback for lists. Only explicit quantities/units are extracted.
// Ambiguous lines stay visible and incomplete for review, never silently dropped.
export function parseIntakeList(text:string):IntakeData{
 const result:IntakeData={date:'',supplier:'',reference:'',currency:'',total:null,notes:'',items:[]};
 const number=(s:string)=>{const n=s.replace(/\s/g,'');if(/^\d+(?:[.,]\d{1,2})?$/.test(n))return Number(n.replace(',','.'));return null;};
 const unit='(kg|g|gr|L|ml|litros?|un|unidades?|uds?|cajas?|bolsas?|botellas?|paquetes?|latas?|rollos?)';
 for(const raw of text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,100)){
  const line=raw.replace(/^[-•]\s*/,'');let m;
  if((m=line.match(/^fecha\s*[:;]\s*(\d{4}-\d{2}-\d{2})$/i))){result.date=m[1];continue;}
  if((m=line.match(/^proveedor\s*[:;]\s*(.+)$/i))){result.supplier=m[1].slice(0,140);continue;}
  if((m=line.match(/^(?:factura|referencia)\s*[:;]\s*(.+)$/i))){result.reference=m[1].slice(0,140);continue;}
  if((m=line.match(/^moneda\s*[:;]\s*(USD|EUR|ARS|PAB)$/i))){result.currency=m[1].toUpperCase() as IntakeData['currency'];continue;}
  if((m=line.match(/^total\s*[:;]?\s*(USD|EUR|ARS|PAB)?\s*([\d.,]+)\s*(USD|EUR|ARS|PAB)?$/i))){result.total=number(m[2]);if(m[1]||m[3])result.currency=(m[1]||m[3]).toUpperCase() as IntakeData['currency'];continue;}
  if(/^producto\s*[;,\t|]/i.test(line))continue;
  const separator=/[;\t|]/.test(line)?(line.match(/[;\t|]/)![0]):',';
  const cells:string[]=[];let cell='',quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===separator&&!quoted){cells.push(cell.trim());cell='';}else cell+=c;}cells.push(cell.trim());
  let row:IntakeData['items'][number]={name:line.slice(0,140),quantity:null,unit:'',location:'',area:'',unitCost:null,productId:''};
  if(cells.length>=3){row={...row,name:cells[0].slice(0,140),quantity:number(cells[1]),unit:cells[2].slice(0,20),location:(cells[3]||'').slice(0,140),unitCost:cells[4]?number(cells[4]):null};}
  else if((m=line.match(new RegExp('^(\\d+(?:[.,]\\d{1,2})?)\\s*'+unit+'\\s+(?:de\\s+)?(.+)$','i')))){row.name=m[3].slice(0,140);row.quantity=number(m[1]);row.unit=m[2];}
  else if((m=line.match(new RegExp('^(.+?)\\s*[:=]\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*'+unit+'$','i')))){row.name=m[1].slice(0,140);row.quantity=number(m[2]);row.unit=m[3];}
  result.items.push(row);
 }
 return result;
}
