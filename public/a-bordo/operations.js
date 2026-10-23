"use strict";
let opsData=null,opsReservations=[],opsCandidates=[],opsLoading=false,opsBusy=false,opsError='',opsRenderToken=0,opsRequestSeed=null;
const opsLabels={request_create:'Faltante agregado',request_status:'Pedido actualizado',request_receive:'Pedido recibido',stock_add:'Inventario cargado',stock_consume:'Consumo registrado',transfer_send:'Transferencia enviada',transfer_receive:'Transferencia recibida',transfer_cancel:'Transferencia cancelada',reservation_link:'Reserva vinculada',reservation_preferences:'Reserva actualizada',collection_instruction:'Cobro indicado',collection_report:'Cobro informado',collection_review:'Cobro revisado',tareas_por_atender:'Tareas de hoy o vencidas',trabajo_realizado:'Trabajo realizado',problema_registrado:'Problema registrado',transferencia_pendiente:'Transferencia pendiente',push_test:'Prueba de notificación'};
const opsButton=(page,label)=>`<button type="button" class="day-secondary" data-day="ops-${page}">${label}</button>`;
const opsAction=(op,id,label,extra={})=>`<button type="button" class="day-secondary" data-op="${op}" data-id="${esc(id)}" ${Object.entries(extra).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
const opsField=(label,name,type='text',value='',attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const opsAmount=(name='quantity',max='')=>opsField('Cantidad',name,'number','',`required min="0.0001" step="0.0001" ${max?`max="${max}"`:''}`);
const opsArea=(selected="")=>`<label>Área<select name="area"><option value="gastronomia" ${selected==="gastronomia"?"selected":""}>Cocina y bebidas</option><option value="tecnica" ${selected==="tecnica"?"selected":""}>Limpieza, repuestos y otros insumos</option></select></label>`;
const opsForm=(operation,body,id='')=>`<form class="ops-form" data-operation="${operation}" data-id="${esc(id)}">${body}<p class="form-error" role="alert"></p><button class="day-primary" type="submit">Guardar</button></form>`;
async function opsFetch(operation,body) {
 let response;try{response=await fetch('/api/boat-ops/'+operation+(body?'':'?boat='+encodeURIComponent(boatId)),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify({...body,boat:boatId}):undefined});}catch{throw Error('No se pudo confirmar el guardado. El borrador queda en este dispositivo; reintentá al recuperar conexión.');}
 const data=await response.json();if(!response.ok){const error=Error(data.error||'No se pudo completar');error.status=response.status;throw error;}return data;
}
async function opsReload() {
 const token=++opsRenderToken, boat=boatId;
 opsLoading=true;opsError='';
 try{
  const [data,reservations]=await Promise.all([opsFetch('overview'),opsFetch('reservations')]);
  if(token!==opsRenderToken||boat!==boatId)return;
  opsData=data;opsReservations=reservations;
 }catch(e){opsError=e.message;}finally{if(token===opsRenderToken){opsLoading=false;if(view==='day')render();}}
}
function opsPreparation(){
 const missing=[];
 if(!state.boat.equipment.length)missing.push('Cargar equipos y horas reales');
 if(!state.products.length)missing.push('Contar y cargar existencias');
 const unassigned=state.tasks.filter(t=>!t.done&&!t.assignedRole).length;
 const unscheduled=state.tasks.filter(t=>!t.done&&!t.nextDate&&(t.nextHours==null||t.nextHours==='')&&!t.intervalDays&&!t.intervalMonths&&!t.intervalHours&&!t.routineCycle&&!t.routineEvent).length;
 const unstarted=state.tasks.filter(t=>!t.done&&!t.lastCompleted&&(t.intervalDays||t.intervalMonths||t.intervalHours||t.routineCycle)).length;
 if(unstarted)missing.push(`${unstarted} rutinas pendientes de primera realización`);
 if(unassigned)missing.push(`${unassigned} tareas sin rol asignado`);
 if(unscheduled)missing.push(`${unscheduled} tareas sin programación`);
 return `<h2>Preparar el barco para trabajar</h2><p class="day-muted">Completá los datos reales. No se crean existencias ni frecuencias de ejemplo.</p>${missing.map(t=>`<div class="day-note">${esc(t)}</div>`).join('')||'<div class="day-note">Equipos, inventario y programación cargados.</div>'}<div class="ops-actions">${dayButton('manage','Administrar tareas y tripulación')}${opsButton('stock','Cargar inventario')}</div><p>En Administrar → Barco y respaldo cargá equipos; en cada tarea indicá rol, fecha y frecuencia. En Tripulación se crean accesos personales.</p>${session.admin?`<h3>Respaldo completo</h3>${opsAction('backup','','Descargar respaldo')}<p>Incluye inventario, tareas, fotos, pedidos, transferencias y reservas vinculadas. La restauración conserva cobros y transferencias: si cambiaron desde la copia, exige recuperación coordinada.</p><label>Restaurar una copia de este barco<input id="opsBackupFile" type="file" accept="application/json"></label>`:''}`;
}
function opsRequests(){
 const all=opsData.requests, seed=opsRequestSeed?.boat===boatId?opsRequestSeed:null;
 return `<h2>Pedidos y faltantes</h2>${opsAction("export_requests","","Descargar pedido consolidado")}<p>Los faltantes se acumulan por área. Una compra suma existencias al registrar su recepción.</p><details class="day-disclosure" ${seed?"open":""}><summary>＋ Falta algo</summary>${opsForm('request_create',opsArea(seed?.area)+opsField('Producto','name','text',seed?.name||'','required maxlength="140"')+opsField('Unidad (un, kg, L, caja…)','unit','text',seed?.unit||'','required maxlength="20"')+opsAmount()+`<label>Detalle<textarea name="notes" maxlength="5000"></textarea></label><label class="check"><input name="urgent" type="checkbox">Urgente</label><label>Foto opcional<input name="photo" type="file" accept="image/*"></label>`)}</details>${['gastronomia','tecnica'].map(area=>`<h3>${area==='gastronomia'?'Cocina y bebidas':'Limpieza, repuestos y otros insumos'}</h3>${all.filter(q=>q.area===area).map(q=>`<article class="day-inventory"><h3>${esc(q.name)}</h3><p>${q.quantity} ${esc(q.unit)} · ${esc(q.status)}${q.urgent?' · URGENTE':''}</p><p>Recibido: ${q.received} · Pendiente: ${Number(q.quantity)-Number(q.received)}</p><p>${esc(q.notes)}</p>${q.photo?`<img class="day-reference" src="${esc(q.photo)}" alt="Faltante">`:''}<div class="ops-actions">${q.status==='borrador'&&(dayManager()||q.created_by===session.id)?opsAction('request_status',q.id,'Solicitar',{status:'solicitado'}):''}${dayManager()&&['solicitado','aprobado'].includes(q.status)?opsAction('request_status',q.id,q.status==='solicitado'?'Aprobar':'Marcar comprado',{status:q.status==='solicitado'?'aprobado':'comprado'}):''}${dayManager()&&Number(q.received)===0&&!['recibido','cancelado'].includes(q.status)?opsAction('request_status',q.id,'Cancelar',{status:'cancelado'}):''}</div>${q.status==='comprado'&&(dayManager()||role==='capitan')?`<details class="day-disclosure"><summary>Recibir mercadería</summary>${opsForm('request_receive',opsAmount('quantity',Number(q.quantity)-Number(q.received))+opsProductChoice(q.area,q.unit)+opsField('Ubicación','location','text','','required'),q.id)}</details>`:''}</article>`).join('')||empty('No hay pedidos en esta área.')}`).join('')}`;
}
function opsProductChoice(area,unit){return `<label>Sumar a<select name="productId"><option value="">Crear nuevo insumo</option>${state.products.filter(p=>(p.area||'tecnica')===area&&p.unit===unit).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.location)}</option>`).join('')}</select></label>`;}
function opsStock(){
 const products=state.products, open=opsData.requests.filter(q=>!['recibido','cancelado'].includes(q.status));
 return `<p class="day-eyebrow">${esc(state.boat.name)} · EXISTENCIAS Y REPOSICIÓN</p><h1>Stock y pedidos</h1><p>Consultá cantidades verificadas, registrá el consumo y agregá lo que falta.</p><div class="day-note">${products.length} insumos cargados · ${products.filter(p=>Number(p.current)===0).length} con cantidad cero registrada · ${open.length} pedidos abiertos</div><div class="ops-actions">${opsButton('intake','Cargar foto o lista')}${opsButton('expenses','Ver gastos')}${opsButton('requests','Ver pedidos y agregar faltantes')}</div><p class="day-muted">Faltante → Solicitado → Aprobado → Comprado → Recibido. El stock aumenta únicamente con la cantidad recibida; una solicitud no es una compra.</p>${!products.length?'<div class="day-note"><strong>Conteo inicial pendiente</strong><br>Todavía no se cargó el conteo inicial. Esto no significa que el barco esté vacío. Ya podés anotar faltantes en Pedidos. Usá Cargar foto o lista para enviar el conteo: producto, cantidad, unidad y ubicación. Administración lo confirma.</div>':''}${dayManager()?`<details class="day-disclosure"><summary>＋ Cargar cantidad contada</summary><p>Usá este formulario para un insumo nuevo. Para insumos existentes, revisá su ficha en Administrar → Inventario; no dupliques un producto para corregir su cantidad.</p>${opsForm('stock_add',opsArea()+opsField('Producto','name','text','','required maxlength="140"')+opsField('Unidad','unit','text','','required maxlength="20"')+opsField('Cantidad contada','quantity','number','','required min="0" step="0.0001"')+opsField('Ubicación','location','text','','required')+opsField('Observación','note'))}</details><details class="day-disclosure"><summary>Recuperar inventario gastronómico anterior</summary><p>Cargá el respaldo y verificá cada cantidad antes de guardar.</p><input id="legacyInventory" type="file" accept="application/json"><div id="legacyReview"></div></details>`:''}${products.length?`<label>Buscar insumo o ubicación<input id="opsStockSearch" type="search" placeholder="Nombre o lugar donde se guarda"></label><label>Filtrar por área<select id="opsStockArea"><option value="">Todas las áreas</option><option value="gastronomia">Cocina y bebidas</option><option value="tecnica">Limpieza, repuestos y otros insumos</option></select></label>`:''}<div id="opsStockList">${products.map(p=>`<article class="day-inventory" data-stock-search="${esc(dayNormalize(p.name+' '+p.location))}" data-stock-area="${esc(p.area||'tecnica')}"><div class="day-card-heading"><h2>${esc(p.name)}</h2><strong>${p.current} ${esc(p.unit)}</strong></div><p>${esc(p.location||'Ubicación pendiente')} · ${p.area==='gastronomia'?'Cocina y bebidas':'Limpieza, repuestos y otros insumos'}</p>${Number(p.current)===0?'<p class="ops-critical">Sin existencias registradas</p>':Number(p.min)>0&&Number(p.current)<=Number(p.min)?'<p class="ops-critical">Llegó al mínimo definido</p>':''}<p class="day-muted">${Number(p.min)>0?'Mínimo definido: '+p.min+' '+esc(p.unit):'Sin mínimo definido'}${p.expiryDate?' · Vence '+date(p.expiryDate):''}</p>${writable()?opsAction('request_product',p.id,'Pedir reposición'):''}${writable()&&Number(p.current)>0?`<details class="day-disclosure"><summary>Registrar consumo</summary><p>Registrá solo lo utilizado. Si ya lo descontaste como material de un trabajo, no lo cargues otra vez.</p>${opsForm('stock_consume',`<input type="hidden" name="productId" value="${esc(p.id)}">`+opsAmount('quantity',p.current)+opsField('Motivo','note','text','','required minlength="3"'))}</details>`:''}${(dayManager()||['chef','capitan'].includes(role))&&opsData.fleet.length>1&&Number(p.current)>0?`<details class="day-disclosure"><summary>Transferir a otro barco</summary>${opsForm('transfer_send',`<input type="hidden" name="productId" value="${esc(p.id)}"><label>Destino<select name="target">${opsData.fleet.filter(b=>b.id!==boatId).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>`+opsAmount('quantity',p.current))}</details>`:''}</article>`).join('')}</div><p id="opsStockNoMatch" hidden>No hay insumos con ese filtro.</p>${opsData.fleet.filter(b=>b.id!==boatId).map(b=>`<details class="day-disclosure"><summary>${esc(b.name)} · ${b.products.length} insumos</summary>${b.products.map(p=>`<p>${esc(p.name)} · ${p.current} ${esc(p.unit)} · ${esc(p.location)}</p>`).join('')||'<p>Sin conteo cargado.</p>'}</details>`).join('')}`;
}
function opsFilterStock(){
 const query=dayNormalize($('#opsStockSearch')?.value||''),area=$('#opsStockArea')?.value||'';
 let visible=0;document.querySelectorAll('[data-stock-search]').forEach(el=>{el.hidden=!el.dataset.stockSearch.includes(query)||(area&&el.dataset.stockArea!==area);if(!el.hidden)visible++;});
 if($('#opsStockNoMatch'))$('#opsStockNoMatch').hidden=!state.products.length||visible>0;
}

function opsTransfers(){return `<h2>Transferencias</h2><p>La salida queda en tránsito hasta que el destino confirma cuánto recibió.</p>${opsData.transfers.map(t=>`<article class="day-inventory"><h3>${esc(t.product.name)}</h3><p>${esc(opsData.fleet.find(b=>b.id===t.source_id)?.name||'Origen')} → ${esc(opsData.fleet.find(b=>b.id===t.target_id)?.name||'Destino')}</p><p>${t.quantity} ${esc(t.product.unit)} · ${esc(t.status)} · Recibido ${t.received}</p>${t.status==='en_transito'&&t.target_id===boatId&&(dayManager()||['capitan','chef'].includes(role))?opsForm('transfer_receive',opsAmount('quantity',Number(t.quantity)-Number(t.received))+opsProductChoice(t.product.area||'tecnica',t.product.unit)+opsField('Ubicación','location','text','','required'),t.id):''}${t.status==='en_transito'&&t.source_id===boatId&&Number(t.received)===0?opsAction('transfer_cancel',t.id,'Cancelar y devolver al origen'):''}</article>`).join('')||empty('No hay transferencias.')}`;}
function opsReservationsView(){return `<h2>Reservas de ${esc(state.boat.name)}</h2><p>Fechas y datos operativos consultados del CRM. Las reservas contratadas de Nomade se vinculan desde el CRM. Administración puede revisar otras vinculaciones.</p>${session.admin?opsAction('candidates','','Vincular reserva del CRM'):''}<div id="opsCandidates"></div>${opsReservations.map(res=>{
 const reported=(res.reports||[]).filter(x=>x.status!=='rechazado').reduce((a,x)=>a+Number(x.amount),0);
 const confirmed=(res.reports||[]).filter(x=>x.status==='confirmado').reduce((a,x)=>a+Number(x.amount),0);
 return `<details class="day-disclosure"><summary>${date(res.start)} · ${esc(res.name||'Reserva')} · ${res.guests||'—'} pasajeros</summary><p>${date(res.start)} → ${date(res.end)} · ${esc(res.status)}</p><p>${esc(res.notes||'Sin observaciones operativas')}</p>${(res.passengers||[]).map(p=>`<article class="day-inventory"><h3>${esc(p.name)}</h3><p>Alimentación: ${esc(p.food||'No informado')}</p>${p.avoid?`<div class="ops-critical">Evitar: ${esc(p.avoid)}</div>`:''}<p>${esc(p.requests||'')}</p></article>`).join('')}<p>Actividades: ${esc((res.interests||[]).join(', '))}</p>${res.collection?`<div class="ops-critical"><h3>Cobrar al huésped</h3><strong>${Math.max(0,Number(res.collection.amount)-confirmed)} ${esc(res.collection.currency)}</strong><p>${esc(res.collection.concept)} · ${date(res.collection.due_date)}</p><p>Informado sin confirmar: ${reported-confirmed}. La confirmación operativa no concilia el libro financiero del CRM.</p>${res.collection.valid===false?'<p>El saldo cambió en el CRM. Administración debe verificarlo nuevamente.</p>':''}${res.collection.valid!==false&&Number(res.collection.amount)>reported?opsForm('collection_report',opsField('Importe cobrado','amount','number','','required min="0.01" step="0.01" max="'+(Number(res.collection.amount)-reported)+'"')+opsField('Medio / comprobante','note'),res.id):''}</div>`:''}${(res.reports||[]).map(c=>`<div class="day-note">${c.amount} ${esc(c.currency)} · ${esc(c.status)} · ${esc(c.note)}${session.admin&&c.status==='informado'?opsAction('collection_review',c.id,'Confirmar recepción',{status:'confirmado'})+opsAction('collection_review',c.id,'Rechazar',{status:'rechazado'}):''}</div>`).join('')}${session.admin?`<details class="day-disclosure"><summary>Asignación y observaciones complementarias</summary>${opsForm('reservation_preferences',`<label>Capitán<select name="captainId"><option value="">Sin asignar</option>${opsData.members.filter(m=>m.role==='capitan').map(m=>`<option value="${esc(m.id)}" ${m.id===res.captainId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`+['food','allergies','drinks','activities'].map((key,i)=>opsField(['Alimentación adicional','Alergias adicionales','Bebidas','Actividades adicionales'][i],key,'text',res.preferences?.[key]||'')).join(''),res.id)}</details><details class="day-disclosure"><summary>Verificar instrucción de cobro</summary><p>Referencia del CRM: ${res.crmBalance==null?'No informado':esc(res.crmBalance)+' '+esc(res.currency||'')}. Confirmá el importe antes de habilitarlo al capitán.</p>${opsForm('collection_instruction',opsField('Importe','amount','number',res.crmBalance??'','required min="0.01" step="0.01"')+`<label>Moneda<select name="currency"><option>USD</option><option>EUR</option><option>ARS</option></select></label>`+opsField('Concepto','concept','text','Saldo de reserva','required')+opsField('Fecha de cobro','dueDate','date',res.start||'','required')+`<label class="check"><input type="checkbox" name="verified" required>Verifiqué el importe y la moneda en el CRM</label>`,res.id)}</details>`:''}${Object.entries(res.preferences||{}).filter(([,v])=>v).map(([k,v])=>`<p><strong>${esc(({food:'Alimentación',allergies:'Alergias',drinks:'Bebidas',activities:'Actividades'})[k]||k)}:</strong> ${esc(v)}</p>`).join('')}</details>`;
 }).join('')||empty('No hay reservas vinculadas.')}`;}
function opsNotifications(){return `<h2>Notificaciones</h2><p>Activá los avisos en este dispositivo. En iPhone, agregá A bordo a la pantalla de inicio y abrilo desde su icono.</p><div class="ops-actions">${opsAction('subscribe','','Activar en este teléfono')}${opsAction('unsubscribe','','Desactivar en este teléfono')}${opsAction('push_test','','Enviar prueba')}</div><p id="pushResult" role="status"></p>${opsData.notifications.map(n=>`<article class="day-inventory"><strong>${esc(opsLabels[n.kind]||n.kind)}</strong><p>${date(n.created_at)} · ${n.read_at?'Leída':'Sin leer'}</p>${!n.read_at?opsAction('notification_read',n.id,'Marcar leída'):''}</article>`).join('')||empty('Sin novedades.')}`;}
const opsOriginalRenderDay=renderDay;
renderDay=function(){
 opsOriginalRenderDay();
 if(dayPage==='home'){
  const target=document.querySelector('.day-grid');
  target?.insertAdjacentHTML('afterend',`<div class="ops-actions">${opsButton('requests','Pedidos')}${opsButton('intake','Fotos y listas')}${opsButton('expenses','Gastos')}${opsButton('transfers','Transferencias')}${opsButton('reservations','Reservas')}${opsButton('notifications','Notificaciones')}${dayManager()?opsButton('setup','Preparar barco'):''}</div>`);
 }
 const header=document.querySelector('#dayHeader');
 if(header&&boats.length>1)header.insertAdjacentHTML('beforeend',`<select id="opsBoat" aria-label="Cambiar barco">${boats.map(b=>`<option value="${esc(b.id)}" ${b.id===boatId?'selected':''}>${esc(b.name)}</option>`).join('')}</select>`);
 if(!dayPage.startsWith('ops-'))return;
 const name=dayPage.slice(4);
 const content=name==='setup'?opsPreparation():!opsData?'<p>Cargando datos…</p>':({requests:opsRequests,stock:opsStock,intake:intakeView,expenses:intakeExpenses,transfers:opsTransfers,reservations:opsReservationsView,notifications:opsNotifications}[name]?.()||'');
 $('#content').innerHTML=`<div class="day-content">${dayBack()}<div class="ops-actions">${opsButton('requests','Pedidos')}${opsButton('stock','Stock')}${opsButton('reservations','Reservas')}${opsAction('refresh','','Actualizar')}</div>${opsError?`<p class="form-error" role="alert">${esc(opsError)}</p>`:''}${content}<p class="day-muted">${opsLoading?'Actualizando…':'Los cambios se confirman al guardarse en el servidor.'}</p></div>`;
 if($('#opsStockSearch'))$('#opsStockSearch').oninput=opsFilterStock;
 if($('#opsStockArea'))$('#opsStockArea').onchange=opsFilterStock;
 if(!opsData&&!opsLoading&&!opsError)opsReload();
};
document.addEventListener('change',async event=>{
 if(event.target.id==='opsBoat'){opsData=null;await loadBoat(event.target.value);}
 if(event.target.id==='opsBackupFile'){
  try{
   const file=event.target.files[0];if(!file)return;if(file.size>3500000)throw Error('El respaldo supera el límite de restauración de 3,5 MB. Requiere recuperación asistida.');
   const backup=JSON.parse(await file.text());if(backup.boat!==boatId||backup.version!==1)throw Error('El respaldo no corresponde a este barco.');
   if(!confirm('¿Restaurar inventario, tareas y pedidos de esta copia? Se descargará y conservará el estado actual antes de restaurar.'))return;
   const current=await opsFetch('backup');opsDownloadBackup(current,'antes-de-restaurar');
   await opsFetch('backup_restore',{backup,revision:current.revision,key:uid()});toast('Respaldo restaurado.');await opsAfterSave();
  }catch(e){toast(e.message);}return;
 }
 if(event.target.id==='legacyInventory'){
  try{
   const file=event.target.files[0];if(file.size>2000000)throw Error('El archivo supera 2 MB.');
   const imported=JSON.parse(await file.text());
   if(!Array.isArray(imported.products)||imported.products.length>1000)throw Error('Respaldo inválido.');
   $('#legacyReview').innerHTML='<p>Revisá cada producto y confirmá la cantidad contada. No se importará nada automáticamente.</p>'+imported.products.map(p=>opsForm('stock_add',`<input type="hidden" name="area" value="gastronomia">`+opsField('Producto','name','text',p.name,'required')+opsField('Unidad','unit','text',p.unit,'required')+opsField('Cantidad contada','quantity','number',p.current,'required min="0" step="0.0001"')+opsField('Ubicación','location','text','','required')+opsField('Observación','note','text','Revisión de respaldo gastronómico'))).join('');
  }catch(e){toast(e.message);}
 }
});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!form.matches('.ops-form'))return;
 event.preventDefault();if(opsBusy||!form.reportValidity())return;
 clearTimeout(draftTimer);opsBusy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));if(form.dataset.id)data.id=form.dataset.id;
  for(const key of ['quantity','amount'])if(key in data)data[key]=Number(data[key]);
  if(form.dataset.operation==='request_create'){
   data.urgent=form.elements.urgent.checked;
   const file=form.elements.photo.files[0];data.photo=file?(await api('photos','POST',{boat:boatId,data:await photo(file)})).url:'';
  }
  if(form.dataset.operation==='collection_instruction')data.verified=form.elements.verified.checked;
  if(form.dataset.operation==='reservation_preferences'){data.preferences={};for(const key of ['food','allergies','drinks','activities']){data.preferences[key]=data[key];delete data[key];}}
  const serialized=JSON.stringify(data);if(form.dataset.payload!==serialized){form.dataset.key=uid();form.dataset.payload=serialized;}
  form._opsPending ||= {...data,key:form.dataset.key};
  await draftSave(form);
  await opsFetch(form.dataset.operation,form._opsPending);
  await draftWrite(draftKey(form),null);
  if(form.dataset.operation==='request_create')opsRequestSeed=null;
  toast('Guardado en el servidor');await opsAfterSave();
 }catch(e){if(e.status&&e.status<500){form._opsPending=null;await draftSave(form);}form.querySelector('.form-error').textContent=e.message;}finally{opsBusy=false;button.disabled=false;}
});
async function opsAfterSave(){const page=dayPage;await loadBoat(boatId);dayPage=page;await opsReload();}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-op]');if(!button||opsBusy)return;
 const operation=button.dataset.op;opsBusy=true;button.disabled=true;
 try{
  if(operation==='request_product'){const p=state.products.find(p=>p.id===button.dataset.id);if(!p)throw Error('Insumo no disponible');opsRequestSeed={boat:boatId,name:p.name,unit:p.unit,area:p.area||'tecnica'};dayPage='ops-requests';render();return;}
  if(operation==='export_expenses'){
   const from=$('#intakeExpenseFrom')?.value||'',to=$('#intakeExpenseTo')?.value||'';
   const rows=[['Fecha','Proveedor','Comprobante','Importe','Moneda','Registrado por'],...state.purchases.filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)).map(p=>[p.date,p.supplier,p.reference,p.total,p.currency||state.boat.currency,p.recordedBy||''])];
   const quote=value=>'"'+String(value??'').replace(/^[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
   const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='gastos-'+state.boat.name+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(operation==='backup'){opsDownloadBackup(await opsFetch('backup'),'respaldo');return;}
  if(operation==='refresh'){if(dayPage==='ops-intake'){if($('#intakeReview'))intakeRead($('#intakeReview'));await opsAfterSave();intakeError='';await intakeReload();}else await opsReload();return;}
  if(operation==='export_requests'){
   const grouped=new Map();
   for(const row of opsData.requests.filter(q=>!['recibido','cancelado'].includes(q.status))){const k=[row.area,row.name.trim().toLowerCase(),row.unit].join('|');const item=grouped.get(k)||{area:row.area,name:row.name,unit:row.unit,quantity:0};item.quantity+=Number(row.quantity)-Number(row.received);grouped.set(k,item);}
   const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
   const content='\uFEFF'+[['Área','Producto','Unidad','Pendiente'],...[...grouped.values()].map(x=>[x.area,x.name,x.unit,x.quantity])].map(row=>row.map(quote).join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='pedido-'+state.boat.name+'-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(operation==='candidates'){
   opsCandidates=await opsFetch('reservation_candidates');
   $('#opsCandidates').innerHTML=opsCandidates.map(r=>`<div class="day-note">${esc(r.name)} · ${date(r.start)} ${opsAction('reservation_link',r.id,'Vincular a '+esc(state.boat.name))}</div>`).join('')||empty('No hay reservas disponibles.');return;
  }
  if(operation==='subscribe'||operation==='unsubscribe'){
   if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Este navegador no permite notificaciones. En iPhone abrí la app instalada en inicio.');
   if(operation==='subscribe'&&!opsData.pushPublicKey)throw Error('Las notificaciones todavía no están configuradas en el servidor.');
   const permission=operation==='subscribe'?await Notification.requestPermission():Notification.permission;
   if(operation==='subscribe'&&permission!=='granted')throw Error('No se habilitó el permiso de notificaciones.');
   const registration=await navigator.serviceWorker.register('/a-bordo/push-sw.js',{scope:'/a-bordo/'});
   if(!registration.active)await new Promise(resolve=>{const worker=registration.installing||registration.waiting;worker?.addEventListener('statechange',()=>{if(worker.state==='activated')resolve();});});
   let subscription=await registration.pushManager.getSubscription();
   if(operation==='unsubscribe'){if(subscription){await opsFetch('push_unsubscribe',{key:uid(),endpoint:subscription.endpoint});await subscription.unsubscribe();}toast('Notificaciones desactivadas en este dispositivo');return;}
   if(!subscription){const key=opsData.pushPublicKey.replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(key),c=>c.charCodeAt(0));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
   await opsFetch('push_subscribe',{key:uid(),subscription:subscription.toJSON()});toast('Dispositivo habilitado. Usá Enviar prueba para comprobarlo.');return;
  }
  if(['collection_review','reservation_link','transfer_cancel'].includes(operation)&&!confirm('¿Confirmar esta operación?'))return;
  button.dataset.key ||=uid();
  const payload={key:button.dataset.key};if(button.dataset.id)payload.id=operation==='notification_read'?Number(button.dataset.id):button.dataset.id;if(button.dataset.status)payload.status=button.dataset.status;
  await opsFetch(operation,payload);toast(operation==='push_test'?'Prueba registrada; comprobá que llegue al teléfono.':'Guardado');await opsAfterSave();
 }catch(e){toast(e.message);}finally{opsBusy=false;button.disabled=false;}
});

const opsOriginalLoadBoat=loadBoat;
loadBoat=async function(id){if(id!==boatId){opsRequestSeed=null;opsData=null;opsReservations=[];opsRenderToken++;opsLoading=false;opsError='';$('#content').innerHTML='<p role="status">Cargando barco…</p>';}return opsOriginalLoadBoat(id);};
renderFood=function(){dayPage="ops-stock";view="day";render();};

function opsDownloadBackup(backup,prefix){const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=prefix+'-'+state.boat.name+'-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

