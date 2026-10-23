const required=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>140)throw Error('Campo inválido');};
export function validateRestoredBoatState(s:any,boat:string) {
 if(!s||s.schema!==1||!s.boat)throw new Error('Formato de respaldo inválido.');
 required(s.boat.name);
 if(!['USD','ARS','EUR'].includes(s.boat.currency))throw new Error('Moneda inválida.');
 const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e12;
 for(const key of ['products','tasks','logs','movements','purchases','cameras']) {
  if(!Array.isArray(s[key])||s[key].length>20000||s[key].some((x:any)=>!x||typeof x.id!=='string')||new Set(s[key].map((x:any)=>x.id)).size!==s[key].length)throw new Error('Datos inválidos en '+key);
 }
 if(!Array.isArray(s.boat.equipment)||s.boat.equipment.some((e:any)=>!e||typeof e.id!=='string'||typeof e.name!=='string'||!number(e.hours)))throw new Error('Equipos inválidos.');
 const photo=(v:any)=>typeof v==='string'&&new RegExp('^/api/boat/photos\\?boat='+boat+'&id=[a-f0-9-]{36}$').test(v);
 for(const p of s.products){required(p.name);if(typeof p.unit!=='string'||['current','min','cost'].some(k=>!number(p[k]))||(p.photo&&!photo(p.photo)))throw new Error('Insumo inválido.');}
 for(const l of s.logs)if(typeof l.title!=='string'||typeof l.date!=='string'||!Array.isArray(l.lines)||!Array.isArray(l.photos)||l.photos.some((v:any)=>!photo(v)))throw new Error('Trabajo inválido.');
 for(const p of s.purchases)if(!Array.isArray(p.lines)||typeof p.date!=='string')throw new Error('Compra inválida.');
 for(const t of s.tasks)if(typeof t.title!=='string'||(t.photo&&!photo(t.photo))||!['','capitan','chef','marinero'].includes(t.assignedRole??''))throw new Error('Tarea inválida.');
}
