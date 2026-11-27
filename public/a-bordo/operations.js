"use strict";
let opsData=null,opsReservations=[],opsCandidates=[],opsLoading=false,opsBusy=false,opsError='',opsRenderToken=0,opsRequestSeed=null;
const opsLabels={package_dispatched:'Paquete de Tierra en camino',package_received:'Recepción de mercadería firmada',package_issue:'Paquete con diferencias por revisar',brief_published:'Ficha del viaje publicada',stock_minimo:'Stock en el mínimo',stock_agotado:'Insumo agotado',request_create:'Faltante agregado',request_status:'Pedido actualizado',request_receive:'Pedido recibido',stock_add:'Inventario cargado',stock_consume:'Consumo registrado',transfer_send:'Transferencia enviada',transfer_receive:'Transferencia recibida',transfer_cancel:'Transferencia cancelada',reservation_link:'Reserva vinculada',reservation_preferences:'Reserva actualizada',collection_instruction:'Cobro indicado',collection_report:'Cobro informado',collection_review:'Cobro revisado',tareas_por_atender:'Tareas de hoy o vencidas',trabajo_realizado:'Trabajo realizado',problema_registrado:'Problema registrado',transferencia_pendiente:'Transferencia pendiente',push_test:'Prueba de notificación'};
const opsButton=(page,label)=>`<button type="button" class="day-secondary" data-day="ops-${page}">${label}</button>`;
const opsAction=(op,id,label,extra={})=>`<button type="button" class="day-secondary" data-op="${op}" data-id="${esc(id)}" ${Object.entries(extra).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
const opsField=(label,name,type='text',value='',attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const opsAmount=(name='quantity',max='')=>opsField('Cantidad',name,'number','',`required min="0.0001" step="0.0001" ${max?`max="${max}"`:''}`);
const opsArea=(selected="")=>`<label>Área<select name="area"><option value="gastronomia" ${selected==="gastronomia"?"selected":""}>Bebidas y mercadería</option><option value="tecnica" ${selected==="tecnica"?"selected":""}>Materiales, repuestos y limpieza</option></select></label>`;
const opsForm=(operation,body,id='')=>`<form class="ops-form" data-operation="${operation}" data-id="${esc(id)}">${body}<p class="form-error" role="alert"></p><button class="day-primary" type="submit">Guardar</button></form>`;
async function opsFetch(operation,body,owner=boatId) {
 let response;try{response=await fetch('/api/boat-ops/'+operation+(body?'':'?boat='+encodeURIComponent(owner)),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify({...body,boat:owner}):undefined});}catch{throw Error(body?'No se pudo confirmar el guardado. Recuperá la conexión para verificarlo.':'No se pudo actualizar la información. Revisá la conexión y volvé a intentar.');}
 const data=await response.json();if(!response.ok){const error=Error(data.error||'No se pudo completar');error.status=response.status;throw error;}return data;
}
async function opsReload() {
 const token=++opsRenderToken, boat=boatId;
 opsLoading=true;opsError='';
 try{
  const [data,reservations]=await Promise.all([opsFetch('overview'),opsFetch('reservations')]);
  if(token!==opsRenderToken||boat!==boatId)return;
  opsData=data;opsReservations=reservations;
 }catch(e){if(token===opsRenderToken&&boat===boatId)opsError=e.message;}finally{if(token===opsRenderToken){opsLoading=false;if(view==='day')render();}}
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
 return `<h2>Pedidos y faltantes</h2>${opsAction("export_requests","","Descargar pedido consolidado")}<p>Los faltantes se acumulan por área. Una compra suma existencias al registrar su recepción.</p>${writable()?`<details class="day-disclosure" ${seed?"open":""}><summary>＋ Falta algo</summary>${opsForm('request_create',opsArea(seed?.area)+opsField('Producto','name','text',seed?.name||'','required maxlength="140"')+opsField('Unidad (un, kg, L, caja…)','unit','text',seed?.unit||'','required maxlength="20"')+opsAmount()+`<label>Detalle<textarea name="notes" maxlength="5000"></textarea></label><label class="check"><input name="urgent" type="checkbox">Urgente</label><label>Foto opcional<input name="photo" type="file" accept="image/*"></label>`)}</details>`:''}${['gastronomia','tecnica'].map(area=>`<h3>${area==='gastronomia'?'Bebidas y mercadería':'Materiales, repuestos y limpieza'}</h3>${all.filter(q=>q.area===area).map(q=>`<article class="day-inventory"><h3>${esc(q.name)}</h3><p>${q.quantity} ${esc(q.unit)} · ${esc(q.status)}${q.urgent?' · URGENTE':''}</p><p>Recibido: ${q.received} · Pendiente: ${Number(q.quantity)-Number(q.received)}</p><p>${esc(q.notes)}</p>${q.photo?`<img class="day-reference" src="${esc(q.photo)}" alt="Faltante">`:''}<div class="ops-actions">${q.status==='borrador'&&(dayManager()||q.created_by===session.id)?opsAction('request_status',q.id,'Solicitar',{status:'solicitado'}):''}${dayManager()&&['solicitado','aprobado'].includes(q.status)?opsAction('request_status',q.id,q.status==='solicitado'?'Aprobar':'Marcar comprado',{status:q.status==='solicitado'?'aprobado':'comprado'}):''}${dayManager()&&Number(q.received)===0&&!['recibido','cancelado'].includes(q.status)?opsAction('request_status',q.id,'Cancelar',{status:'cancelado'}):''}</div>${q.status==='comprado'&&session.admin?`<details class="day-disclosure"><summary>Recibir mercadería</summary>${opsForm('request_receive',opsAmount('quantity',Number(q.quantity)-Number(q.received))+opsProductChoice(q.area,q.unit,q.name)+opsField('Ubicación','location','text','','required'),q.id)}</details>`:''}</article>`).join('')||empty('No hay pedidos en esta área.')}`).join('')}`;
}
function opsProductChoice(area,unit,name){
 const normalized=value=>String(value||'').trim().normalize('NFC').toLowerCase();
 const choices=state.products.filter(p=>(p.area||'tecnica')===area&&normalized(p.unit)===normalized(unit)&&normalized(p.name)===normalized(name));
 return `<label>Ficha de destino<select name="productId" data-receive-product><option value="">Buscar en la ubicación o crear una ficha</option>${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.location)}</option>`).join('')}</select></label>`;
}
let opsStockTab={owner:'',area:'gastronomia'};
function currentStockTab(){
 const owner=[session.id,boatId,role].join(':');
 if(opsStockTab.owner!==owner)opsStockTab={owner,area:'gastronomia'};
 return opsStockTab;
}
const stockArea=p=>p.area==='gastronomia'?'gastronomia':'tecnica';
const canMoveFridge=()=>Boolean(session?.admin||['encargado','capitan','chef','marinero'].includes(role));
const fridgeSource=p=>p.area==='gastronomia'&&/^(?:dep[oó]sito(?:\s|$)|recepci[oó]n a bordo$)/iu.test(String(p.location||'').trim())&&/^(un|unidad|unidades|ud|uds|lata|latas|botella|botellas)$/iu.test(String(p.unit||'').trim())&&/(^|[^\p{L}])(agua|cerveza|gaseosa|refresco|coca|pepsi|sprite|fanta|seven|fresca|soda|lata|7up|7-up)([^\p{L}]|$)/iu.test(p.name);
const fridgeForm=p=>canMoveFridge()&&fridgeSource(p)&&Number(p.current)>=1?`<details class="day-disclosure"><summary>Pasar bebidas a la heladera</summary><p>Sale de ${esc(p.location)} y entra a Heladera. No se registra como consumo.</p>${opsForm('fridge_move',`<input type="hidden" name="productId" value="${esc(p.id)}">`+opsField('Unidades','quantity','number','','required min="1" step="1" max="'+Math.min(1000000,Math.floor(Number(p.current)))+'"'),p.id)}</details>`:'';
function opsStock(){
 const area=currentStockTab().area,technical=area==='tecnica';
 const products=state.products.filter(p=>stockArea(p)===area), open=opsData.requests.filter(q=>!['recibido','cancelado'].includes(q.status));
 return `<h1>Stock · ${esc(state.boat.name)}</h1><stockroom-packages></stockroom-packages><p class="area-summary">${products.length} artículos · ${open.length} pedidos abiertos</p>
 <div class="area-actions">${session.admin?opsButton('admin-stock','Stock general · Tierra y barcos'):''}${session.admin&&!technical?'<button type="button" class="day-primary" data-intake="ticket">Cargar ticket y sumar stock</button>'+opsButton('intake','Conteos y listas'):''}${opsButton('requests','Ver pedidos y agregar faltantes')}</div>
 <div class="area-actions" role="group" aria-label="Tipo de inventario">${[['gastronomia','Insumos'],['tecnica','Repuestos y materiales']].map(([key,label])=>`<button type="button" data-op="stock_tab" data-id="${key}" class="${area===key?'day-primary':'day-secondary'}" aria-pressed="${area===key}">${label}</button>`).join('')}</div>
 <h2>${technical?'Repuestos y materiales':'Insumos'}</h2>${!products.length?`<div class="day-note"><strong>Conteo inicial pendiente</strong><br>${session.admin?'Cargá las cantidades contadas de este inventario.':'Administración debe registrar las cantidades contadas en esta sección.'}</div>`:''}${session.admin?`<details class="day-disclosure"><summary>${technical?'＋ Agregar repuesto':'＋ Agregar insumo manualmente'}</summary><p>Usá este formulario para un insumo nuevo. Para insumos existentes, revisá su ficha en Administrar → Inventario; no dupliques un producto para corregir su cantidad.</p>${opsForm('stock_add',`<input type="hidden" name="area" value="${area}">`+opsField(technical?'Nombre del repuesto':'Producto','name','text','',technical?'required maxlength="140" placeholder="Ej.: Solenoide 12 V"':'required maxlength="140"')+opsField('Unidad','unit','text',technical?'un':'','required maxlength="20"')+opsField('Cantidad contada','quantity','number','','required min="0" step="0.0001"')+opsField('Ubicación','location','text','','required')+opsField('Observación','note','text','','maxlength="500"'))}</details>${technical?'':`<details class="day-disclosure"><summary>Recuperar inventario gastronómico anterior</summary><p>Cargá el respaldo y verificá cada cantidad antes de guardar.</p><input id="legacyInventory" type="file" accept="application/json"><div id="legacyReview"></div></details>`}`:''}${products.length?`<label>Buscar ${technical?'repuesto, referencia o ubicación':'insumo o ubicación'}<input id="opsStockSearch" type="search" placeholder="Nombre o lugar donde se guarda"></label>`:''}<div id="opsStockList">${products.map(p=>`<article class="day-inventory" data-stock-search="${esc(dayNormalize([p.name,p.location,p.code,p.specs].join(' ')))}" data-stock-area="${esc(p.area||'tecnica')}"><div class="day-card-heading"><h2>${esc(p.name)}</h2><strong>${esc(p.current)} ${esc(p.unit)}</strong></div><p>${esc(p.location||'Ubicación pendiente')} · ${p.area==='gastronomia'?'Bebidas y mercadería':'Materiales, repuestos y limpieza'}</p>${Number(p.current)===0?'<p class="ops-critical">Sin existencias registradas</p>':Number(p.min)>0&&Number(p.current)<=Number(p.min)?'<p class="ops-critical">Llegó al mínimo definido</p>':''}<p class="day-muted">${Number(p.min)>0?'Mínimo definido: '+p.min+' '+esc(p.unit):'Sin mínimo definido'}${p.expiryDate?' · Vence '+date(p.expiryDate):''}</p>${writable()?opsAction('request_product',p.id,'Pedir reposición'):''}${technical&&session.admin?action('editProduct','Editar ficha',p.id,'day-secondary'):''}${writable()&&Number(p.current)>0?`<details class="day-disclosure"><summary>${technical?'Registrar uso del repuesto o material':'Registrar consumo'}</summary><p>Registrá solo lo utilizado. Si ya lo descontaste como material de un trabajo, no lo cargues otra vez.</p>${opsForm('stock_consume',`<input type="hidden" name="productId" value="${esc(p.id)}">`+opsAmount('quantity',p.current)+opsField('Motivo','note','text','','required minlength="3"'))}</details>`:''}${fridgeForm(p)}${(dayManager()||['chef','capitan'].includes(role))&&opsData.fleet.length>1&&Number(p.current)>0?`<details class="day-disclosure"><summary>Transferir a otro barco</summary>${opsForm('transfer_send',`<input type="hidden" name="productId" value="${esc(p.id)}"><label>Destino<select name="target">${opsData.fleet.filter(b=>b.id!==boatId).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>`+opsAmount('quantity',p.current))}</details>`:''}</article>`).join('')}</div><p id="opsStockNoMatch" hidden>No hay insumos con ese filtro.</p><details class="day-disclosure"><summary>Más opciones de stock</summary><div class="area-actions">${canViewFleetStock()?opsButton('fleet','Stock de otros barcos'):''}${opsData.fleet.length>1 || opsData.transfers.length?opsButton('transfers','Transferencias'):''}${opsButton('notifications','Avisos de reposición')}</div></details>`;
}
function opsCash() {
 if(role==='capitan')return captainCashView();
 return `<h1>Caja</h1><div class="area-actions">
   ${session.admin ? '<button type="button" class="day-primary" data-intake="expense">Cargar gasto</button>' : ''}
   ${session.admin ? opsButton('collections','Efectivo de los capitanes') : ''}
   ${opsButton('expenses',dayManager() ? 'Gastos y pagos a proveedores' : 'Consultar gastos y pagos')}
   ${session.admin ? '<a class="day-secondary" href="https://crm.nomadsailors.com/finanzas" target="_blank" rel="noopener">Abrir caja en Finanzas ↗</a>' : ''}
 </div>`;
}
function opsCollections() {
 return captainCashView();
}
function opsFilterStock(){
 const query=dayNormalize($('#opsStockSearch')?.value||''),area=$('#opsStockArea')?.value||'';
 let visible=0;document.querySelectorAll('[data-stock-search]').forEach(el=>{el.hidden=!el.dataset.stockSearch.includes(query)||(area&&el.dataset.stockArea!==area);if(!el.hidden)visible++;});
 if($('#opsStockNoMatch'))$('#opsStockNoMatch').hidden=!state.products.length||visible>0;
}

function opsTransfers(){return `<h2>Transferencias</h2><p>La salida queda en tránsito hasta que el destino confirma cuánto recibió.</p>${opsData.transfers.map(t=>`<article class="day-inventory"><h3>${esc(t.product.name)}</h3><p>${esc(opsData.fleet.find(b=>b.id===t.source_id)?.name||'Origen')} → ${esc(opsData.fleet.find(b=>b.id===t.target_id)?.name||'Destino')}</p><p>${t.quantity} ${esc(t.product.unit)} · ${esc(t.status)} · Recibido ${t.received}</p>${t.status==='en_transito'&&t.target_id===boatId&&(dayManager()||['capitan','chef'].includes(role))?opsForm('transfer_receive',opsAmount('quantity',Number(t.quantity)-Number(t.received))+opsProductChoice(t.product.area||'tecnica',t.product.unit,t.product.name)+opsField('Ubicación','location','text','','required'),t.id):''}${t.status==='en_transito'&&t.source_id===boatId&&Number(t.received)===0?opsAction('transfer_cancel',t.id,'Cancelar y devolver al origen'):''}</article>`).join('')||empty('No hay transferencias.')}`;}
function opsReservationsView(){return `<h2>Reservas de ${esc(state.boat.name)}</h2><p>Fechas y datos operativos consultados del CRM. Las reservas contratadas de Nomade se vinculan desde el CRM. Administración puede revisar otras vinculaciones.</p><div id="opsCandidates"></div>${opsReservations.map(res=>{
 const reported=(res.reports||[]).filter(x=>x.status!=='rechazado').reduce((a,x)=>a+Number(x.amount),0);
 const confirmed=(res.reports||[]).filter(x=>x.status==='confirmado').reduce((a,x)=>a+Number(x.amount),0);
 return `<details class="day-disclosure"><summary>${date(res.start)} · ${esc(res.name||'Reserva')} · ${res.guests||'—'} pasajeros</summary><p>${date(res.start)} → ${date(res.end)} · ${esc(res.status)}</p><p>${esc(res.notes||'Sin observaciones operativas')}</p>${(res.passengers||[]).map(p=>`<article class="day-inventory"><h3>${esc(p.name)}</h3><p>Alimentación: ${esc(p.food||'No informado')}</p>${p.avoid?`<div class="ops-critical">Evitar: ${esc(p.avoid)}</div>`:''}<p>${esc(p.requests||'')}</p></article>`).join('')}<p>Actividades: ${esc((res.interests||[]).join(', '))}</p>${res.collection?`<div class="ops-critical"><h3>Cobrar al huésped</h3><strong>${Math.max(0,Number(res.collection.amount)-confirmed)} ${esc(res.collection.currency)}</strong><p>${esc(res.collection.concept)} · ${date(res.collection.due_date)}</p><p>Informado sin confirmar: ${reported-confirmed}. La confirmación operativa no concilia el libro financiero del CRM.</p>${res.collection.valid===false?'<p>El saldo cambió en el CRM. Administración debe verificarlo nuevamente.</p>':''}${res.collection.valid!==false&&Number(res.collection.amount)>reported?opsForm('collection_report',opsField('Importe cobrado','amount','number','','required min="0.01" step="0.01" max="'+(Number(res.collection.amount)-reported)+'"')+opsField('Medio / comprobante','note'),res.id):''}</div>`:''}${(res.reports||[]).map(c=>`<div class="day-note">${c.amount} ${esc(c.currency)} · ${esc(c.status)} · ${esc(c.note)}${session.admin&&c.status==='informado'?opsAction('collection_review',c.id,'Confirmar recepción',{status:'confirmado'})+opsAction('collection_review',c.id,'Rechazar',{status:'rechazado'}):''}</div>`).join('')}${session.admin?`<details class="day-disclosure"><summary>Asignación y observaciones complementarias</summary>${opsForm('reservation_preferences',`<label>Capitán<select name="captainId"><option value="">Sin asignar</option>${opsData.members.filter(m=>m.role==='capitan').map(m=>`<option value="${esc(m.id)}" ${m.id===res.captainId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>`+['food','allergies','drinks','activities'].map((key,i)=>opsField(['Alimentación adicional','Alergias adicionales','Bebidas','Actividades adicionales'][i],key,'text',res.preferences?.[key]||'')).join(''),res.id)}</details><details class="day-disclosure"><summary>Verificar instrucción de cobro</summary><p>Referencia del CRM: ${res.crmBalance==null?'No informado':esc(res.crmBalance)+' '+esc(res.currency||'')}. Confirmá el importe antes de habilitarlo al capitán.</p>${opsForm('collection_instruction',opsField('Importe','amount','number',res.crmBalance??'','required min="0.01" step="0.01"')+`<label>Moneda<select name="currency"><option>USD</option><option>EUR</option><option>ARS</option></select></label>`+opsField('Concepto','concept','text','Saldo de reserva','required')+opsField('Fecha de cobro','dueDate','date',res.start||'','required')+`<label class="check"><input type="checkbox" name="verified" required>Verifiqué el importe y la moneda en el CRM</label>`,res.id)}</details>`:''}${Object.entries(res.preferences||{}).filter(([,v])=>v).map(([k,v])=>`<p><strong>${esc(({food:'Alimentación',allergies:'Alergias',drinks:'Bebidas',activities:'Actividades'})[k]||k)}:</strong> ${esc(v)}</p>`).join('')}</details>`;
 }).join('')||empty('No hay reservas vinculadas.')}`;}
function opsStockNotice(n){
 if(!BoatStockAlerts.isAlert(n.kind))return '';
 const product=state.products.find(p=>p.id===n.detail?.productId);
 return `<p>${esc(BoatStockAlerts.body(n.kind,n.detail))}</p><p>${esc(n.detail?.location||'Ubicación pendiente')}</p><p class="day-muted">${!product?'El producto ya no está en el inventario.':BoatStockAlerts.level(product)?'Todavía requiere reposición. Disponible ahora: '+esc(product.current)+' '+esc(product.unit):'El stock ya fue repuesto o el mínimo fue actualizado.'}</p>${product&&BoatStockAlerts.level(product)&&writable()?opsAction('request_product',product.id,'Pedir reposición'):''}`;
}
function opsNotifications(){return `<h2>Notificaciones</h2><p>Los avisos de stock llegan al mínimo definido y cuando se agota un producto. No se repiten mientras siga en el mismo nivel. El historial conserva el aviso aunque se reponga.</p><p>Activá los avisos en este dispositivo. En iPhone, agregá A bordo a la pantalla de inicio y abrilo desde su icono.</p><div class="ops-actions">${opsAction('subscribe','','Activar en este teléfono')}${opsAction('unsubscribe','','Desactivar en este teléfono')}${opsAction('push_test','','Enviar prueba')}</div><p id="pushResult" role="status"></p>${opsData.notifications.map(n=>`<article class="day-inventory"><strong>${esc(opsLabels[n.kind]||n.kind)}</strong>${opsStockNotice(n)}${n.kind==='package_dispatched'?opsButton('stock','Abrir paquetes'):''}${n.kind==='brief_published'?'<p><a href="?boat='+encodeURIComponent(boatId)+'&reservation='+encodeURIComponent(n.detail.reservationId)+'">Abrir ficha · versión '+esc(n.detail.version)+'</a></p>':''}<p>${date(n.created_at)} · ${n.read_at?'Leída':'Sin leer'}</p>${!n.read_at?opsAction('notification_read',n.id,'Marcar leída'):''}</article>`).join('')||empty('Sin novedades.')}`;}
const opsOriginalRenderDay=renderDay;
renderDay=function(){
 opsOriginalRenderDay();
 const header=document.querySelector('#dayHeader');
 if(header&&boats.length>1)header.querySelector('.area-account').insertAdjacentHTML('beforebegin',`<select id="opsBoat" aria-label="Cambiar barco">${boats.map(b=>`<option value="${esc(b.id)}" ${b.id===boatId?'selected':''}>${esc(b.name)}</option>`).join('')}</select>`);
 if(!dayPage.startsWith('ops-'))return;
 const name=dayPage.slice(4);
 if(name==='admin-stock'){
  $('#content').innerHTML='<div class="day-content"><div class="area-subnav">'+dayBack()+'</div>'+(session.admin?'<boat-admin-stock></boat-admin-stock>':'<p>Acceso reservado a administración.</p>')+'</div>';
  return;
 }
 const content=name==='setup'?opsPreparation():!opsData?'<p>Cargando datos…</p>':({requests:opsRequests,stock:opsStock,fleet:fleetStockView,intake:intakeView,expenses:intakeExpenses,cash:opsCash,collections:opsCollections,transfers:opsTransfers,reservations:opsReservationsView,agenda:()=>typeof briefAgendaView==='function'?briefAgendaView():'',notifications:opsNotifications}[name]?.()||'');
 const refresh = name !== 'expenses' && name !== 'cash' ? opsAction('refresh','','Actualizar') : '';
 $('#content').innerHTML=`<div class="day-content"><div class="area-subnav">${dayBack()}${refresh}</div>${opsError?`<p class="form-error" role="alert">${esc(opsError)} ${!refresh ? opsAction('refresh','','Reintentar') : ''}</p>`:''}${content}${opsLoading?'<p class="day-muted" role="status">Actualizando…</p>':''}</div>`;
 if(dayPage==='ops-fleet')fleetStockBind();
 if($('#opsStockSearch'))$('#opsStockSearch').oninput=opsFilterStock;
 if(!opsData&&!opsLoading&&!opsError)opsReload();
};
document.addEventListener('change',async event=>{
 if(event.target.matches('[data-receive-product]')){
  const selected=state.products.find(p=>p.id===event.target.value);
  if(selected)event.target.form.elements.location.value=selected.location||'';
 }
 if(event.target.id==='opsBoat'){if(daySaving||intakeBusy||expenseBusy||opsBusy||(typeof briefBusy!=='undefined'&&briefBusy)){event.target.value=boatId;return;}try{await loadBoat(event.target.value);}catch(error){toast(error.message);}}
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
  const input=event.target;
  const file=input.files?.[0];
  const owner=boatId;
  input.value='';
  if(!file||!session?.admin)return;
  try{
   if(file.size>2000000)throw Error('El archivo supera 2 MB.');
   const backup=JSON.parse(await file.text());
   if(!Array.isArray(backup.products)||!backup.products.length||backup.products.length>1000)throw Error('El respaldo debe contener entre 1 y 1000 productos.');
   const items=backup.products.map((row,i)=>{
    if(!row||typeof row.name!=='string'||!row.name.trim())throw Error('Falta el nombre en la fila '+(i+1)+'.');
    const quantity=typeof row.current==='number'||(typeof row.current==='string'&&row.current.trim())?Number(row.current):null;
    return {name:row.name.trim(),unit:typeof row.unit==='string'?row.unit.trim():'',
     quantity:Number.isFinite(quantity)&&quantity>=0?quantity:null,location:typeof row.location==='string'?row.location.trim():'',
     area:'gastronomia',unitCost:null,productId:''};
   });
   if(boatId!==owner||!input.isConnected)return;
   const review=$('#legacyReview');
   const groups=Array.from({length:Math.ceil(items.length/100)},(_,i)=>'<option value="'+i+'">Filas '+(100*i+1)+' a '+Math.min(100*(i+1),items.length)+'</option>').join('');
   review.innerHTML='<p>'+items.length+' productos en el respaldo. Revisá las cantidades y ubicaciones contra el conteo físico actual.</p><label>Filas para revisar<select>'+groups+'</select></label><button type="button" class="day-secondary">Revisar conteo</button>';
   review.querySelector('button').onclick=async()=>{
    try{
     const context=intakeContext();
     const key=context.draftKey;
     const [previous,pending]=await Promise.all([draftRead(key),draftRead(context.pendingKey)]);
     if(boatId!==owner||!review.isConnected||!session?.admin)return;
     if(previous||pending){toast('Ya hay un conteo o ticket en preparación. Revisalo en Conteos y listas antes de abrir el respaldo.');return;}
     const start=Number(review.querySelector('select').value)*100;
     intakeBoat=context.draftKey;intakeRestore=null;intakeDocs=null;intakeError='';
     intakeDraft={kind:'count',source:{text:file.name+' · filas '+(start+1)+' a '+Math.min(start+100,items.length),photos:[]},
      notice:'Respaldado anteriormente. Confirmá cada cantidad contra lo contado a bordo.',
      data:{date:'',supplier:'',reference:'',currency:'',total:null,notes:'',items:items.slice(start,start+100)}};
     await draftWrite(key,intakeDraft);
     if(boatId!==owner||!review.isConnected)return;
     dayPage='ops-intake';navigate('day');
    }catch(error){toast(error.message);}
   };
  }catch(error){toast(error.message);}
 }

});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!form.matches('.ops-form'))return;
 const owner=boatWriteContext(),savedKey=draftKey(form);
 event.preventDefault();if(opsBusy||!form.reportValidity())return;
 clearTimeout(draftTimer);opsBusy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
 try{
  const saved = await draftRead(savedKey);
  verifyBoatWrite(owner);
  if (!form._opsPending && saved?.pending) {
   restorePendingOperation(form,saved);
   form.querySelector('.form-error').textContent='Hay un envío anterior sin confirmar. Verificá esos datos antes de continuar.';
   return;
  }
  if (!form._opsPending) {
    const data=Object.fromEntries(new FormData(form));if(form.dataset.id&&form.dataset.operation!=='fridge_move')data.id=form.dataset.id;
    for(const key of ['quantity','amount'])if(key in data)data[key]=Number(data[key]);
    if(form.dataset.operation==='request_create'){
     data.urgent=form.elements.urgent.checked;
     const file=form.elements.photo.files[0];data.photo=file?(await api('photos','POST',{boat:owner.boat,data:await photo(file)})).url:'';
    }
    if(form.dataset.operation==='collection_instruction')data.verified=form.elements.verified.checked;
    if(form.dataset.operation==='reservation_preferences'){data.preferences={};for(const key of ['food','allergies','drinks','activities']){data.preferences[key]=data[key];delete data[key];}}
    const serialized=JSON.stringify(data);if(form.dataset.payload!==serialized){form.dataset.key=uid();form.dataset.payload=serialized;}
    form._opsPending = {...data,key:form.dataset.key};
  }
  verifyBoatWrite(owner);
  const claimed=await draftSave(form);
  if(claimed?.pending&&claimed.pending.key!==form._opsPending.key){
   restorePendingOperation(form,claimed);
   form.querySelector('.form-error').textContent='Hay un envío anterior sin confirmar. Verificá esos datos antes de continuar.';
   return;
  }
  const operationKey=form._opsPending.key;
  verifyBoatWrite(owner);
  const result=await opsFetch(form.dataset.operation,form._opsPending,owner.boat);
  if(form.dataset.operation==='fridge_move'&&!(result?.ok===true&&result.quantity===form._opsPending.quantity&&Number.isFinite(result.fromBalance)&&Number.isFinite(result.toBalance)))throw Error('No se pudo verificar el movimiento. Confirmá el guardado pendiente antes de repetirlo.');
  if(form.dataset.operation==='captain_personal_movement'&&
     (result?.ok!==true||!Number.isSafeInteger(result.entryId)||result.entryId<=0)){
    const unknown=new Error('No se pudo confirmar el movimiento. Reintentá con los mismos datos.');
    unknown.status=503;throw unknown;
  }
  await editStoredDraft(savedKey,old=>old?.pending?.key===operationKey?null:old);
  if(!sameBoatOwner(owner))return;
  if(form.dataset.operation==='request_create')opsRequestSeed=null;
  if(['captain_opening','captain_expense','captain_handover','captain_personal_movement'].includes(form.dataset.operation))invalidateCaptainCash();
  toast('Guardado en el servidor');await opsAfterSave();
 }catch(e){
   if(!sameBoatOwner(owner))return;
   if(e.status&&e.status<500){
    const rejectedKey=form._opsPending?.key;
    if(rejectedKey)await editStoredDraft(savedKey,old=>old?.pending?.key===rejectedKey?{...old,pending:null}:old);
    form._opsPending=null;lockPendingOperation(form,false);
   }
   else if(form._opsPending){lockPendingOperation(form,true);}
   form.querySelector('.form-error').textContent=e.message;
 }finally{opsBusy=false;button.disabled=false;}
});
async function opsAfterSave(){
 const owner=boatId,user=session?.id,page=dayPage;
 await loadBoat(owner);
 if(boatId!==owner||session?.id!==user)return;
 dayPage=page;await opsReload();
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-op]');if(!button||opsBusy||expenseBusy||(typeof briefBusy!=="undefined"&&briefBusy))return;
 const operation=button.dataset.op;opsBusy=true;button.disabled=true;
 try{
  if(operation==='stock_tab'){if(dayPage==='ops-stock'&&['gastronomia','tecnica'].includes(button.dataset.id)){currentStockTab().area=button.dataset.id;render();}return;}
  if(operation==='request_product'){const p=state.products.find(p=>p.id===button.dataset.id);if(!p)throw Error('Insumo no disponible');opsRequestSeed={boat:boatId,name:p.name,unit:p.unit,area:p.area||'tecnica'};dayPage='ops-requests';render();return;}
  if(operation==='export_expenses'){expenseDownload();return;}
  if(operation==='backup'){opsDownloadBackup(await opsFetch('backup'),'respaldo');return;}
  if(operation==='refresh'){if(dayPage==='ops-fleet'){await fleetStockReload();return;}if(dayPage==='ops-expenses'){if($('#expenseForm')){toast('Terminá o cancelá el formulario antes de actualizar.');return;}await opsAfterSave();await expenseReload();return;}if(dayPage==='ops-intake'){if($('#intakeReview'))intakeRead($('#intakeReview'));await opsAfterSave();intakeError='';await intakeReload();}else await opsAfterSave();return;}
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
