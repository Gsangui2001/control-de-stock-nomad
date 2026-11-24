export function canReadBoatCash(role: string): boolean {
 return ['administrador','capitan','encargado','lector'].includes(role);
}

export function canReadBoatSuppliers(role: string): boolean {
 return ['administrador','encargado','lector'].includes(role);
}

const privateProductFields = ['cost', 'costKnown', 'costCurrency', 'lastInvoiceUnitCost'] as const;

export function crewProduct(product: Record<string, any>) {
 const visible = { ...product };
 for (const key of privateProductFields) delete visible[key];
 return visible;
}

export function restoreCrewProductCosts(originals: Record<string, any>[], incoming: Record<string, any>[]) {
 if (!Array.isArray(incoming)) throw Error('La lista de insumos es inválida.');
 const byId = new Map(originals.map(product => [product.id, product]));
 return incoming.map(product => {
  const original = product && byId.get(product.id);
  if (!original) throw Error('Solo administración puede crear insumos.');
  for (const key of privateProductFields) {
   if (key in product && product[key] !== original[key]) throw Error('Solo administración puede modificar los costos.');
  }
  // Start from the stored order for the existing history comparison. Missing
  // public fields still have to fail that comparison, including on legacy saves.
  return Object.fromEntries([...Object.keys(original), ...Object.keys(product)]
   .filter(key => key in product || privateProductFields.some(field => field === key))
   .map(key => [key, key in product ? product[key] : original[key]]));
 });
}

export function isOperationalStatePhoto(state: any, url: string): boolean {
 return [...state.boat.equipment, ...state.products, ...state.tasks].some(row => row.photo === url)
  || state.logs.some((log: any) => log.photos?.includes(url));
}

// A crew member may append work and its stock consumption, never rewrite history.
export function protectCrewHistory(before:any, incoming:any, managerName?:string) {
 for(const key of ['logs','movements','purchases']){
  for(const old of before[key]){
   const next=incoming[key].find((x:any)=>x.id===old.id);
   if(key==='logs' && old.reportKind && !old.resolvedAt && next?.resolvedBy===managerName && managerName && typeof next.resolvedAt==='string' && Number.isFinite(Date.parse(next.resolvedAt))){
    const {resolvedAt:oldAt,resolvedBy:oldBy,...original}=old;
    const {resolvedAt:newAt,resolvedBy:newBy,...updated}=next;
    if(JSON.stringify(original)===JSON.stringify(updated))continue;
   }
   if(!next||JSON.stringify(next)!==JSON.stringify(old))throw Error('El historial existente no se puede editar ni eliminar.');
  }
 }
 if(incoming.purchases.length!==before.purchases.length)throw Error('Registrá las compras mediante Pedidos y recepción.');
 const newLogs=incoming.logs.filter((x:any)=>!before.logs.some((old:any)=>old.id===x.id));
 const consumed=new Map<string,number>();
 for(const log of newLogs){
  for(const line of log.lines){
   if(typeof line.productId!=='string'||typeof line.quantity!=='number'||!Number.isFinite(line.quantity)||line.quantity<=0)throw Error('Consumo inválido.');
   consumed.set(line.productId,(consumed.get(line.productId)||0)+line.quantity);
  }
 }
 if(incoming.products.length!==before.products.length)throw Error('Solo administración puede crear insumos.');
 for(const old of before.products){
  const next=incoming.products.find((p:any)=>p.id===old.id);
  if(!next)throw Error('No se puede eliminar un insumo.');
  const expected=Math.round((old.current-(consumed.get(old.id)||0))*10000)/10000;
  if(expected<0||next.current!==expected)throw Error('El stock no coincide con los materiales del trabajo.');
  const {current:_,...oldFields}=old,{current:__,...nextFields}=next;
  if(JSON.stringify(oldFields)!==JSON.stringify(nextFields))throw Error('No se puede modificar la ficha del insumo.');
 }
 for(const id of Array.from(consumed.keys()))if(!before.products.some((p:any)=>p.id===id))throw Error('Insumo inexistente.');
 const deltas=new Map<string,number>();
 for(const movement of incoming.movements.filter((x:any)=>!before.movements.some((old:any)=>old.id===x.id))){
  if(typeof movement.delta!=='number'||!Number.isFinite(movement.delta))throw Error('Movimiento inválido.');
  deltas.set(movement.productId,(deltas.get(movement.productId)||0)+movement.delta);
 }
 for(const id of Array.from(new Set([...Array.from(consumed.keys()),...Array.from(deltas.keys())])))if(Math.abs((deltas.get(id)||0)+(consumed.get(id)||0))>0.0001)throw Error('Los movimientos no coinciden con el consumo.');
}
