"use strict";
let briefExternal=null,briefBusy=false;
const briefFields={country:'País de procedencia',airConditioning:'Aire acondicionado (sí, no o por confirmar)',embarkation:'Lugar de embarque',embarkationTime:'Hora de embarque (hora local)',disembarkation:'Lugar de desembarque',disembarkationTime:'Hora de desembarque / salida tardía',food:'Dieta específica',allergies:'Alergias / alimentos a evitar',drinks:'Bebidas preferidas',activities:'Experiencia deseada',transport:'Cómo llegan / traslado',requests:'Preparación y pedidos especiales'};
const briefMissing=value=>value===null||value===undefined||value===''?'Pendiente de informar':String(value);
const briefInterest=value=>({snorkeling:'Esnórquel',diving:'Buceo',guna_culture:'Cultura guna',fishing:'Pesca',relax:'Descanso',sailing:'Navegación',gastronomy:'Gastronomía',remote_islands:'Islas remotas',family_activities:'Actividades en familia',other:'Otros'})[value]||value;
const briefTime=value=>value?new Date(value).toLocaleString('es',{dateStyle:'short',timeStyle:'short'}):'Pendiente';
const briefMoney=n=>'USD '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
// Names are compared without accents, case or repeated spaces so the principal
// guest is not listed twice when the CRM wrote the name slightly differently.
const briefNorm=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
// An age that did not arrive is unknown: no parentheses, never a guessed number.
const briefAge=v=>{const n=typeof v==='string'&&/^\s*\d{1,3}\s*$/.test(v)?Number(v):v;return Number.isInteger(n)&&n>=0&&n<130?n:null;};
const briefDay=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v??''));return m?`${m[3]}/${m[2]}`:'';};
const briefLate=v=>/late\s*check[\s-]*out|salida\s+tard[ií]a|check[\s-]*out\s+tard[ií]o/i.test(String(v??''));
function briefCharterDates(res,details){
 const from=briefDay(res.start),to=briefDay(res.end);
 if(!from&&!to)return '';
 return `${from||'Pendiente'} - ${to||'Pendiente'}${briefLate(details.disembarkationTime)?' LATE CHECK OUT':''}`;
}
// The manifest marks the principal with primary:true (the contact name may differ
// from the passport). Older data has no flag: fall back to the normalized name.
const briefHasPrimaryFlag=passengers=>passengers.some(p=>typeof p?.primary==='boolean');
function briefCompanions(res,passengers){
 const main=briefNorm(res.name),others=briefHasPrimaryFlag(passengers)?passengers.filter(p=>p.primary!==true):passengers.filter(p=>!(main&&briefNorm(p.name)===main));
 const named=others.filter(p=>typeof p.name==='string'&&p.name.trim()).map(p=>{const age=briefAge(p.age);return p.name.trim()+(age==null?'':` (${age})`);});
 const total=Number.isInteger(res.guests)?res.guests:null,missing=total==null?0:Math.max(0,total-1-named.length);
 if(named.length)return named.join(' · ')+(missing?` · ${missing} más con nombre pendiente`:'');
 if(missing)return `${missing} acompañante${missing===1?'':'s'} · nombres pendientes`;
 // "-" means the principal travels alone, so it needs evidence: a count of one
 // or a passenger list that only holds the principal. Otherwise it is unknown.
 if((total!=null&&total<=1)||(total==null&&passengers.length&&!others.length))return '-';
 return '';
}
function briefContent(res){
 const details=res.details||res.brief?.draft||{},legacy=res.legacyPreferences||{},passengers=Array.isArray(res.passengers)?res.passengers:[];
 // Never summarize internal notes into the crew card. Only explicitly structured
 // fields from the approved snapshot belong in the arrival briefing.
 const value=v=>typeof v==='string'&&!/^\s*[-–—]\s*$/.test(v)?v.trim():'';
 const joined=items=>[...new Set(items.map(value).filter(Boolean))].join(' · ');
 const named=key=>passengers.filter(p=>value(p[key])).map(p=>`${value(p.name)||'Pasajero'}: ${value(p[key])}`);
 const pending='Pendiente de confirmar';
 const row=(label,content,critical=false)=>`<p class="guest-line${critical?' guest-alert':''}"><strong>${label}</strong><span>${esc(content||pending)}</span></p>`;
 const facts=(label,content)=>`<div><dt>${label}</dt><dd>${esc(content||pending)}</dd></div>`;
 const avoid=joined([details.allergies,legacy.allergies,...named('avoid')]);
 const diet=joined([details.food,legacy.food,...named('food')]);
 const prefer=joined([details.drinks,legacy.drinks,details.foodPreferences]);
 const requests=joined([details.requests,...named('requests')]);
 const primaryPassenger=briefHasPrimaryFlag(passengers)?passengers.find(p=>p.primary===true):null;
 const age=briefAge(res.primaryAge)??briefAge(primaryPassenger?.age),principal=value(res.name)?value(res.name)+(age==null?'':` (${age})`):'';
 const experience=joined([details.activities,legacy.activities,...(res.interests||[]).map(briefInterest)]);
 return `<article class="guest-sheet" aria-label="Información del huésped">
 <h3>Información del huésped</h3>
 <dl class="guest-facts">${facts('Fecha del charter',briefCharterDates(res,details))}${facts('Nombre del cliente principal',principal)}${facts('Acompañantes',briefCompanions(res,passengers))}${facts('País de procedencia',value(details.country))}</dl>
 <div class="guest-block">${row('Aire acondicionado',value(details.airConditioning))}${row('Llegada',joined([details.transport,details.embarkation,details.embarkationTime]))}${row('Salida',joined([details.disembarkation,details.disembarkationTime]))}</div>
 <div class="guest-block"><h4>Información de comidas</h4>${row('A evitar',avoid,Boolean(avoid))}${row('Prefieren',prefer)}${row('Dieta específica',diet)}</div>
 ${briefPayment(res)}
 <div class="guest-block">${row('Experiencia',experience)}${requests?row('Para recibirlos',requests):''}</div>
 </article>${(role!=='capitan'&&('phone' in res))?`<details class="day-disclosure guest-contact"><summary>Contacto del cliente</summary><p>${esc(joined([res.phone,res.email])||pending)}</p></details>`:''}`;
}
// Amounts reach only the captain. The captain's "yes" is the registration: the
// CRM approves it on its own, so there is no "pending Carlota" state anymore.
function briefPayment(res){
 if(role!=='capitan')return '';
 const payment=res.captainPayment,balance=res.captainBalance,mode=res.details?.captainCollection;
 const known=balance?.status==='known'&&typeof balance.amountUsd==='number'&&Number.isFinite(balance.amountUsd)?balance.amountUsd:null;
 let head='por confirmar con Carlota',extra='';
 if(payment?.status==='cleared'){
  const left=typeof payment.balanceUsd==='number'&&payment.balanceUsd>0?payment.balanceUsd:null;
  // "Pagado" only when nothing is left; a cleared partial keeps the remainder visible.
  head=left==null?'pagado':`${briefMoney(left)} pendiente · por confirmar con Carlota`;
  extra=`<p class="guest-pay-note">Cobrado ${esc(briefMoney(payment.amountUsd))} · ${esc(payment.reportedBy||'Capitán')} · ${esc(briefTime(payment.reportedAt))}</p>`;
 }else if(payment){
  head='Pago informado · pendiente de registro';
  extra=`<p class="guest-pay-note">Informado ${esc(briefMoney(payment.amountUsd))} · ${esc(payment.reportedBy||'Capitán')} · ${esc(briefTime(payment.reportedAt))}</p>`;
 }else if(mode==='none')head='no cobra a bordo';
 else if(known===0)head='pagado';
 else if(known>0&&!balance.reportedCount&&!res.brief?.sourceChanged&&res.brief?.version>0){
  head=briefMoney(known);
  extra=`<button type="button" class="day-primary guest-pay-button" data-brief-action="payment" data-id="${esc(res.id)}">Sí, me pagaron ${esc(briefMoney(known))}</button>`;
 }else if(known>0&&balance.reportedCount)head='Pago informado · pendiente de registro';
 return `<div class="guest-block guest-pay"><p class="guest-line guest-pay-line"><strong>A pagar</strong><span>${esc(head)}</span></p>${extra}</div>`;
}
function briefReservationsView(){
 const isAdmin=Boolean(session.admin),pending=opsReservations.filter(r=>r.brief?.version&&!r.brief.reviewedAt).length;
 return `<h2>Huéspedes de ${esc(state.boat.name)}</h2><p>${isAdmin?'Carlota completa la ficha en el CRM y toca Listo para enviarla a la tripulación.':'Abrí la ficha para preparar la llegada y confirmá que la revisaste.'}</p>${!isAdmin&&pending?`<div class="day-note">${pending} ficha(s) pendientes de tu revisión.</div>`:''}${briefAgendaAllowed()?'<div class="ops-actions"><button type="button" class="day-secondary" data-day="ops-agenda">Agenda del mes</button></div>':''}
 ${isAdmin?'<div class="ops-actions"><button type="button" class="day-secondary" data-brief-action="external">Plantillas para otros capitanes</button></div><div id="briefExternal"></div>':''}
 ${opsReservations.map(res=>{
  const b=res.brief||{},changed=b.sourceChanged||b.draftChanged;
  return `<details class="day-disclosure brief-card" id="brief-${esc(res.id)}" ${new URLSearchParams(location.search).get('reservation')===res.id?'open':''}><summary>${date(res.start)} · ${esc(res.name||'Cliente pendiente')} · ${res.guests??'—'} pasajeros · ${b.version?'Versión '+b.version:'Borrador'}</summary>
  ${b.version?`<p class="day-muted">Publicada: ${briefTime(b.publishedAt)}</p>`:'<div class="day-note">Todavía no está publicada para la tripulación.</div>'}
  ${changed?`<div class="ops-critical">${isAdmin?'Hay cambios sin publicar. Revisá y publicá una nueva versión para solicitar otra revisión.':'El CRM cambió desde esta publicación. Administración debe actualizar la ficha; esta es la última versión publicada.'}</div>`:''}
  ${briefContent(res)}
  ${isAdmin?`<details class="day-disclosure guest-admin"><summary>Administración · editar y ver revisiones</summary><details class="day-disclosure"><summary>Completar o corregir la ficha</summary><form class="brief-form" data-operation="brief_save" data-id="${esc(res.id)}" data-revision="${b.revision||0}"><input type="hidden" name="revision" value="${b.revision||0}">${Object.entries(briefFields).map(([key,label])=>`<label>${label}<textarea name="${key}" maxlength="2000" rows="2">${esc(b.draft?.[key]||'')}</textarea></label>`).join('')}<p class="form-error" role="alert"></p><button type="submit" class="day-primary">Guardar borrador</button></form></details>
   <p>${['confirmed','in_progress'].includes(res.status)?'La reserva está confirmada en el CRM.':'La reserva debe confirmarse en el CRM antes de publicar la ficha.'}</p>
   <p>La publicación requiere la aprobación de Carlota en la ficha de la reserva.</p><a class="day-primary" href="https://crm.nomadsailors.com/operaciones" target="_blank" rel="noopener">Abrir reservas en el CRM</a>
   <h3>Revisión de la versión ${b.version||'pendiente'}</h3>${(b.reviews||[]).map(rv=>`<p>${esc(rv.name)} · ${esc(rv.role)}: <strong>${rv.reviewedAt?'Revisado · '+briefTime(rv.reviewedAt):'Pendiente'}</strong></p>`).join('')||'<p>No hay tripulantes asignados.</p>'}</details>`:
   b.reviewedAt?`<div class="day-note">Revisaste la versión ${b.version} el ${briefTime(b.reviewedAt)}.</div>`:
   ['capitan','chef','marinero','encargado'].includes(role)?`<button type="button" class="day-primary" data-brief-action="review" data-id="${esc(res.id)}" ${b.sourceChanged?'disabled':''}>Ya la revisé · versión ${b.version}</button>`:''}
  </details>`;
 }).join('')||empty('No hay fichas disponibles para este barco.')}
 ${isAdmin&&opsReservations.length?`<details class="day-disclosure"><summary>Asignación de capitán e instrucciones de cobro</summary>${briefLegacyReservations()}</details>`:''}`;
}
const briefLegacyReservations=opsReservationsView;
opsReservationsView=briefReservationsView;
function briefTemplate(res){
 const lines=['FICHA DEL VIAJE · '+briefMissing(res.boatName),'Reserva: '+res.id,'Estado en el CRM: '+(({pending:'Pendiente de confirmación',confirmed:'Confirmada',in_progress:'En curso',completed:'Finalizada',cancelled:'Cancelada'})[res.status]||briefMissing(res.status)),
 'Capitán: '+briefMissing(res.captainName),'Cliente: '+briefMissing(res.name),'Contacto del cliente: '+briefMissing(res.phone),
 'Ingreso: '+briefMissing(res.start),'Salida: '+briefMissing(res.end),'Pasajeros: '+briefMissing(res.guests),
 'Embarque / hora local: [completar]','Desembarque / hora local: [completar]','Traslado: [completar]',
 '','PASAJEROS Y ALIMENTACIÓN',...(res.passengers||[]).map(p=>`${briefMissing(p.name)} · Alimentación: ${briefMissing(p.food)} · Evitar: ${briefMissing(p.avoid)} · Pedidos: ${briefMissing(p.requests)}`)];
 if(!res.passengers?.length)lines.push('Pendiente de informar pasajeros y restricciones.');
 lines.push('','Bebidas: [completar]','Actividades: '+briefMissing((res.interests||[]).map(briefInterest).join(', ')),
 'Observaciones: '+briefMissing(res.notes),'','Por favor, confirmá que recibiste y revisaste esta ficha e indicá cualquier dato faltante.');
 return lines.join('\n');
}
function briefExternalView(){
 return `<h3>Otros barcos · plantilla para el capitán</h3><p>Revisá y completá los datos antes de enviarla por el canal habitual. Copiar o descargar no registra un envío ni una confirmación del capitán.</p>${(briefExternal||[]).map(res=>`<details class="day-disclosure"><summary>${esc(res.boatName||'Barco pendiente')} · ${date(res.start)} · ${esc(res.name||'Cliente')}</summary><label>Texto para revisar y enviar<textarea rows="16" data-template="${esc(res.id)}">${esc(briefTemplate(res))}</textarea></label><div class="ops-actions"><button type="button" class="day-secondary" data-brief-action="copy" data-id="${esc(res.id)}">Copiar plantilla</button><button type="button" class="day-secondary" data-brief-action="download" data-id="${esc(res.id)}">Descargar texto</button></div></details>`).join('')||empty('No hay reservas próximas de otros barcos con asignación inequívoca.')}`;
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!form.matches('.brief-form'))return;
 event.preventDefault();if(briefBusy||!form.reportValidity())return;
 briefBusy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
 const data={id:form.dataset.id,revision:Number(form.elements.revision.value),details:Object.fromEntries([...new FormData(form)].filter(([key])=>key!=='revision'))};
 // Keep the same request after an ambiguous network failure; the server receipt
 // resolves it before any new content is sent.
 form._opsPending ||= {...data,key:uid()};
 try{await draftSave(form);await opsFetch('brief_save',form._opsPending);await draftWrite(draftKey(form),null);toast('Borrador guardado. Carlota debe revisarlo y aprobarlo en el CRM.');await opsAfterSave();}
 catch(e){if(e.status&&e.status<500)form._opsPending=null;form.querySelector('.form-error').textContent=e.message;}
 finally{briefBusy=false;button.disabled=false;}
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-brief-action]');if(!button||briefBusy||opsBusy)return;
 const action=button.dataset.briefAction;briefBusy=true;button.disabled=true;
 try{
  if(action==='external'){briefExternal=await opsFetch('external_templates');$('#briefExternal').innerHTML=briefExternalView();return;}
  if(action==='copy'||action==='download'){
   const content=document.querySelector(`[data-template="${CSS.escape(button.dataset.id)}"]`).value;
   if(action==='copy'){await navigator.clipboard.writeText(content);toast('Plantilla copiada. Revisala antes de enviarla.');}
   else{const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ficha-capitan-'+button.dataset.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   return;
  }
  const res=opsReservations.find(r=>r.id===button.dataset.id);if(!res)throw Error('Actualizá para volver a abrir la ficha.');
  const b=res.brief;
  if(action==='publish'&&document.querySelector(`[data-operation="brief_save"][data-id="${CSS.escape(res.id)}"]`)?.dataset.dirty){throw Error('Guardá el borrador antes de publicar.');}
  if(action==='publish'&&!confirm('¿Publicar los datos guardados y avisar a la tripulación del Nomade?'))return;
  if(action==='payment'){const amount=res.captainBalance?.amountUsd;if(!(typeof amount==='number'&&amount>0))throw Error('Actualizá: el saldo a cobrar cambió.');if(!confirm(`¿El cliente te pagó ${briefMoney(amount)} completos? Se registra en la caja del capitán y la venta queda saldada.`))return;}
  button.dataset.key ||=uid();
  const payload={key:button.dataset.key,id:res.id,...(action==='publish'?{revision:b.revision,sourceHash:b.sourceHash}:{version:b.version})};
  const result=await opsFetch(action==='publish'?'brief_publish':action==='payment'?'brief_payment':'brief_review',payload);
  if(action==='payment'){if(result?.payment)res.captainPayment=result.payment;briefAgenda=null;}
  toast(action==='payment'?(result?.payment?.status==='cleared'?'Registrado: pagado. La venta quedó saldada en el CRM.':'Pago informado. Queda pendiente de registro en el CRM.'):action==='publish'?(result.unchanged?'La ficha ya estaba publicada sin cambios.':'Ficha publicada y aviso registrado.'):'Revisión confirmada en el servidor.');
  await opsAfterSave();
 }catch(e){toast(e.message);}finally{briefBusy=false;button.disabled=false;}
});

document.addEventListener('input',event=>{if(event.target.form?.matches('.brief-form'))event.target.form.dataset.dirty='true';});

// Monthly agenda of the Nomade: every charter the CRM confirms, so the captain
// sees the month ahead and opens each guest card from the same place.
let briefAgenda=null,briefAgendaBoat=null,briefAgendaLoading=false,briefAgendaError='',briefAgendaMonth='';
const briefMonths=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const briefCurrentMonth=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Panama'}).slice(0,7);
const briefMonthKey=v=>/^\d{4}-\d{2}/.test(String(v??''))?String(v).slice(0,7):'';
const briefShiftMonth=(key,delta)=>{const [y,m]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);};
const briefMonthName=key=>{const [y,m]=key.split('-').map(Number);return `${briefMonths[m-1]} ${y}`;};
// A charter that crosses the end of the month belongs to both months.
const briefInMonth=(item,key)=>{const s=briefMonthKey(item.start),e=briefMonthKey(item.end)||s;return Boolean(s)&&s<=key&&e>=key;};
function briefAgendaAllowed(){
 if(!(session?.admin||['capitan','encargado'].includes(role)))return false;
 // The server decides with the canonical CRM link; this only hides the entry on other boats.
 return briefNorm(state?.boat?.name).includes('nomade')||(Array.isArray(opsReservations)&&opsReservations.length>0);
}
async function briefAgendaLoad(){
 const boat=boatId;briefAgendaLoading=true;briefAgendaError='';
 try{const data=await opsFetch('agenda');if(boat===boatId)briefAgenda=Array.isArray(data)?data:[];}
 catch(e){if(boat===boatId)briefAgendaError=e.message||'No se pudo leer la agenda.';}
 finally{briefAgendaLoading=false;if(boat===boatId&&dayPage==='ops-agenda')render();}
}
function briefAgendaRow(item){
 const age=briefAge(item.primaryAge),sent=Number(item.briefVersion)>0;
 const guests=Number.isInteger(item.guests)?`${item.guests} pasajero${item.guests===1?'':'s'}`:'Pasajeros por confirmar';
 const tag=(text,kind='')=>`<span class="agenda-tag${kind?' agenda-'+kind:''}">${esc(text)}</span>`;
 const tags=[];
 if(item.status==='in_progress')tags.push(tag('Navegando','live'));
 if(item.status==='completed')tags.push(tag('Terminado'));
 tags.push(tag(sent?'Ficha enviada':'Ficha en preparación',sent?'ok':''));
 if(sent&&item.reviewedAt)tags.push(tag('Revisada'));
 if(role==='capitan'){
  if(item.paid===true)tags.push(tag('Pagado','ok'));
  else if(typeof item.toCollectUsd==='number'&&item.toCollectUsd>0)tags.push(tag('Cobrar '+briefMoney(item.toCollectUsd),'collect'));
 }
 const dates=`${briefDay(item.start)||'Pendiente'} - ${briefDay(item.end)||'Pendiente'}`;
 const inner=`<span class="agenda-main"><span class="agenda-dates">${esc(dates)}</span><strong>${esc(typeof item.name==='string'&&item.name.trim()?item.name.trim():'Cliente por confirmar')}${age==null?'':` (${age})`}</strong><small>${esc(guests)}</small><span class="agenda-tags">${tags.join('')}</span></span>`;
 return sent&&item.id?`<button type="button" class="agenda-row" data-agenda-open="${esc(item.id)}">${inner}<span class="agenda-go" aria-hidden="true">›</span></button>`:`<div class="agenda-row agenda-pending">${inner}</div>`;
}
function briefAgendaView(){
 if(!briefAgendaAllowed())return empty('La agenda del mes está disponible para el capitán del Nomade.');
 if(briefAgendaBoat!==boatId){briefAgenda=null;briefAgendaError='';briefAgendaBoat=boatId;}
 if(briefAgenda===null&&!briefAgendaLoading&&!briefAgendaError)briefAgendaLoad();
 const month=briefAgendaMonth||briefCurrentMonth();
 let body;
 if(briefAgendaError)body=`<p class="form-error" role="alert">${esc(briefAgendaError)}</p>`;
 else if(briefAgenda===null)body='<p class="day-muted">Cargando agenda…</p>';
 else body=briefAgenda.filter(item=>item&&briefInMonth(item,month)).sort((a,b)=>String(a.start).localeCompare(String(b.start))).map(briefAgendaRow).join('')||empty('No hay charters confirmados este mes.');
 return `<h2>Agenda de ${esc(state.boat.name)}</h2><p class="day-muted">Charters confirmados en el CRM. Tocá uno con la ficha enviada para abrirla.</p>
 <div class="agenda-nav"><button type="button" class="day-secondary" data-agenda-month="${briefShiftMonth(month,-1)}" aria-label="Mes anterior">‹</button><h3 aria-live="polite">${briefMonthName(month)}</h3><button type="button" class="day-secondary" data-agenda-month="${briefShiftMonth(month,1)}" aria-label="Mes siguiente">›</button></div>
 <div class="agenda-list">${body}</div>`;
}
document.addEventListener('click',event=>{
 const month=event.target.closest('[data-agenda-month]');
 if(month){briefAgendaMonth=month.dataset.agendaMonth;render();return;}
 const open=event.target.closest('[data-agenda-open]');if(!open)return;
 const id=open.dataset.agendaOpen,params=new URLSearchParams(location.search);params.set('reservation',id);
 history.replaceState(null,'',location.pathname+'?'+params.toString());
 dayPage='ops-reservations';render();
 setTimeout(()=>document.getElementById('brief-'+id)?.scrollIntoView({block:'start'}),0);
});
// Refreshing the operations data also refreshes the agenda (a payment or a new
// confirmation changes it). Guarded so the card renders in isolated tests.
if(typeof opsReload==='function'){const briefOpsReload=opsReload;opsReload=function(){briefAgenda=null;briefAgendaError='';return briefOpsReload.apply(this,arguments);};}
