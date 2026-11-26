import {z} from 'zod';
const short=z.string().trim().max(140), value=z.number().finite().min(0).max(1e9).nullable();
export const intakeKind=z.enum(['count','purchase','expense','request']);
export const intakeData=z.object({
 date:z.string().max(10).default(''),supplier:short.default(''),reference:short.default(''),currency:z.enum(['','USD','EUR','ARS','PAB']).default(''),total:value.default(null),notes:z.string().max(3000).default(''),
 items:z.array(z.object({name:short,quantity:value,unit:z.string().trim().max(20),location:short,area:z.enum(['','gastronomia','tecnica']),unitCost:value.default(null),productId:z.string().max(100).default('')})).max(100)
});
export type IntakeData=z.infer<typeof intakeData>;
export function validateIntakeApply(kind:z.infer<typeof intakeKind>,data:IntakeData){
 const day = new Date(data.date + 'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==data.date)throw Error('Completá una fecha válida.');
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
export class IntakeListError extends Error {}

function listCells(line: string, separator: string): string[] | undefined {
 const cells: string[] = [];
 let cell = '', quoted = false;
 for (let i = 0; i < line.length; i++) {
  const char = line[i];
  if (quoted && char === '"' && line[i + 1] === '"') { cell += '"'; i++; }
  else if (char === '"' && (quoted || !cell.trim())) quoted = !quoted;
  else if (!quoted && char === separator) { cells.push(cell.trim()); cell = ''; }
  else cell += char;
 }
 if (!quoted) return [...cells, cell.trim()];
}

// Keep the source row intact when reading CSV fields containing a delimiter.
export function readIntakeList(text:string,{simpleCount=false}:{simpleCount?:boolean}={}){
 const result:IntakeData={date:'',supplier:'',reference:'',currency:'',total:null,notes:'',items:[]};
 const number=(s:string)=>{const n=s.trim();if(/^\d+(?:[.,]\d{1,2})?$/.test(n))return Number(n.replace(',','.'));return null;};
 const unit='(kg|g|gr|L|ml|litros?|un|unidades?|uds?|cajas?|bolsas?|botellas?|paquetes?|latas?|rollos?)';
 let tabular = true;
 let headerSeparator = '';
 const field = (s:string, limit:number, label:string, line:number) => {
  if(s.length>limit) throw new IntakeListError('Fila '+line+': '+label+' supera '+limit+' caracteres. Acortá ese campo y volvé a cargar la lista.');
  return s;
 };
 let lineNo=0;
 for(const source of text.split(/\r?\n/)){
  lineNo++;
  const raw=source.trim();
  if(!raw)continue;
  const line=raw.replace(/^(?:-\s+|•\s*)/,'');let m;
  if((m=line.match(/^fecha\s*[:;]\s*(\d{4}-\d{2}-\d{2})$/i))){result.date=m[1];continue;}
  if((m=line.match(/^proveedor\s*:\s*(.+)$/i))){result.supplier=field(m[1],140,'el proveedor',lineNo);continue;}
  if((m=line.match(/^(?:factura|referencia)\s*:\s*(.+)$/i))){result.reference=field(m[1],140,'la referencia',lineNo);continue;}
  if((m=line.match(/^moneda\s*[:;]\s*(USD|EUR|ARS|PAB)$/i))){result.currency=m[1].toUpperCase() as IntakeData['currency'];continue;}
  if((m=line.match(/^total\s*[:;]?\s*(USD|EUR|ARS|PAB)?\s*([\d.,]+)\s*(USD|EUR|ARS|PAB)?$/i))){result.total=number(m[2]);if(m[1]||m[3])result.currency=(m[1]||m[3]).toUpperCase() as IntakeData['currency'];continue;}
  // Maintain the two-column metadata format accepted by previous exports.
  if((m=line.match(/^(proveedor|factura|referencia)\s*;\s*([^;]+)$/i))){
   result[m[1].toLowerCase()==='proveedor'?'supplier':'reference']=field(m[2],140,'el dato de comprobante',lineNo);continue;
  }
  const formats=(headerSeparator?[headerSeparator]:['\t',';',',','|'])
   .map(separator=>({separator,cells:listCells(line,separator)}))
   .filter((format):format is {separator:string,cells:string[]}=>Boolean(format.cells && format.cells.length>=3));
  const header=formats.find(f=>/^producto$/i.test(f.cells[0]) && /^cantidad$/i.test(f.cells[1]));
  if(header){headerSeparator=header.separator;continue;}
  const cells=(formats.find(f=>number(f.cells[1])!==null)||formats[0])?.cells;
  if(result.items.length>=100)throw new IntakeListError('La lista supera los 100 productos. Dividila en dos cargas para conservar todas las filas.');
  let row:IntakeData['items'][number]={name:'',quantity:null,unit:'',location:'',area:'',unitCost:null,productId:''};
  if(cells){
   if(cells.length>5)throw new IntakeListError('Fila '+lineNo+': hay más de cinco columnas. Revisá los separadores antes de cargarla.');
   row={...row,name:field(cells[0],140,'el producto',lineNo),quantity:number(cells[1]),unit:field(cells[2],20,'la unidad',lineNo),location:field(cells[3]||'',140,'la ubicación',lineNo),unitCost:cells[4]?number(cells[4]):null};
  }
  else if(headerSeparator) throw new IntakeListError('Fila '+lineNo+': faltan columnas o hay comillas sin cerrar. Revisá la fila indicada.');
  else if((m=line.match(new RegExp('^(\\d+(?:[.,]\\d{1,2})?)\\s*'+unit+'\\s+(?:de\\s+)?(.+)$','i')))){row.name=field(m[3],140,'el producto',lineNo);row.quantity=number(m[1]);row.unit=m[2];}
  else if((m=line.match(new RegExp('^(.+?)\\s*[:=]\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*'+unit+'$','i')))){row.name=field(m[1],140,'el producto',lineNo);row.quantity=number(m[2]);row.unit=m[3];}
  else if(simpleCount&&(m=line.match(/^(.+?)\s*(?:[:=]\s*|\s+)(\d+(?:[.,]\d{1,2})?)$/))&&/\p{L}/u.test(m[1])){row.name=field(m[1],140,'el producto',lineNo);row.quantity=number(m[2]);}
  else row.name=field(line,140,'la descripción',lineNo);
  if(!cells)tabular=false;
  result.items.push(row);
 }
 return {data:result,tabular:tabular&&result.items.length>0};
}
export const parseIntakeList=(text:string):IntakeData=>readIntakeList(text).data;
