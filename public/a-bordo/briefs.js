"use strict";
let briefExternal=null,briefBusy=false,briefAgendaReview=null,briefCalendarSelection=null;
let briefAgendaCalendarOpen=false,briefCalendarButtons=new Map();
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
function briefContent(res,focused=false){
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
 <h3>${focused?'Grupo a bordo':'Información del huésped'}</h3>
 <dl class="guest-facts">${focused?'':facts('Fecha del charter',briefCharterDates(res,details))+facts('Nombre del cliente principal',principal)}${facts('Acompañantes',briefCompanions(res,passengers))}${facts('País de procedencia',value(details.country))}</dl>
 <div class="guest-block">${row('Aire acondicionado',value(details.airConditioning))}${row('Llegada',joined([details.transport,details.embarkation,details.embarkationTime]))}${row('Salida',joined([details.disembarkation,details.disembarkationTime]))}</div>
 <div class="guest-block"><h4>Información de comidas</h4>${row('A evitar',avoid,Boolean(avoid))}${row('Prefieren',prefer)}${row('Dieta específica',diet)}</div>
 ${briefPayment(res)}
 <div class="guest-block">${row('Experiencia',experience)}${requests?row('Para recibirlos',requests):''}</div>
 </article>${(role!=='capitan'&&('phone' in res))?`<details class="day-disclosure guest-contact"><summary>Contacto del cliente</summary><p>${esc(joined([res.phone,res.email])||pending)}</p></details>`:''}`;
}
// The collection is a single explicit action in the authorized guest fiche.
function briefCollectableAmount(res){
 const balance=res.captainBalance, amount=balance?.amountUsd;
 if(role!=='capitan'||res.cashAssigned===false||res.cashLegacyReview||res.captainPayment||
    res.details?.captainCollection!=='collect'||!(res.brief?.version>0)||res.brief.sourceChanged||
    balance?.status!=='known'||balance.reportedCount||typeof amount!=='number'||!Number.isFinite(amount)||amount<=0)return null;
 return amount;
}
function briefPayment(res){
 const amount=briefCollectableAmount(res);
 if(amount===null)return '';
 return `<div class="guest-block guest-pay"><p class="guest-line guest-pay-line"><strong>Cobrar en efectivo</strong><span>${esc(briefMoney(amount))}</span></p><button type="button" class="day-primary guest-pay-button" data-brief-action="payment" data-id="${esc(res.id)}">Sí cobré</button></div>`;
}
function guestDateLabel(value){
 const iso=/^\d{4}-\d{2}-\d{2}/.exec(String(value||''));
 if(!iso)return 'Por confirmar';
 const day=new Date(iso[0]+'T12:00:00Z');
 if(!Number.isFinite(day.getTime()))return 'Por confirmar';
 return day.toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
}
function guestFocusHeader(res){
 const guests=Number.isInteger(res.guests)&&res.guests>0?res.guests+' '+(res.guests===1?'pasajero':'pasajeros'):'Pasajeros por confirmar';
 const status=res.brief?.version?'Ficha publicada':'Ficha en preparación';
 const age=briefAge(res.primaryAge);
 return `<header class="guest-focus-header"><h1>${esc(res.name||'Cliente por confirmar')}</h1>
 <p class="guest-focus-meta">${esc(guests)}${age==null?'':' · Titular de '+age+' años'}<span>${status}</span></p>
 <dl class="guest-itinerary"><div><dt>Embarque</dt><dd>${esc(guestDateLabel(res.start))}</dd></div>
 <div><dt>Desembarque</dt><dd>${esc(guestDateLabel(res.end))}</dd></div></dl></header>`;
}
function briefAuthorizedAgendaPreview(item){
 const v=item?.operationalPreview;
 return role==='capitan'&&!session.admin&&!Number(item?.briefVersion)&&['confirmed','in_progress'].includes(item?.status)
  &&v&&typeof v==='object'&&!Array.isArray(v)?v:null;
}
function briefOperationalPreview(v){
 if(!v)return '';
 const statuses=new Map([['pending','Pendiente'],['requested','Solicitado'],['coordinated','Coordinado'],['confirmed','Confirmado'],['cancelled','Cancelado']]);
 const transport=v.transportRequired===false?'No solicitado':v.transportRequired===true?(statuses.get(v.transportStatus)||'Por confirmar'):'Por confirmar';
 const charter=v.charterType==='private'?'Privado':v.charterType==='shared'?'Compartido':'Por confirmar';
 const clock=new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',dateStyle:'short',timeStyle:'short'});
 const times=(v.transportRequired===true&&Array.isArray(v.confirmedTransferTimes)?v.confirmedTransferTimes:[])
  .filter(t=>t&&['outbound','return'].includes(t.direction)&&typeof t.pickupAt==='string'&&Number.isFinite(Date.parse(t.pickupAt)))
  .map(t=>`<p>Recogida de traslado ${t.direction==='outbound'?'(ida)':'(regreso)'}: ${esc(clock.format(new Date(t.pickupAt)))} · hora de Panamá</p>`).join('');
 return `<section class="day-note" aria-label="Ficha operativa de la reserva"><h2>Ficha operativa de la reserva</h2>
 <p>Fechas y pasajeros se cargan desde el CRM. Modalidad: ${charter}. Traslado: ${transport}.</p>${times}
 <p>El horario de embarque y las preferencias figuran cuando se publica la ficha completa. Esta vista no autoriza cobros.</p></section>`;
}
function briefCalendarCard(item){
 const status=item.tentative===true?'A confirmar':'Registrada en calendario';
 const guests=Number.isInteger(item.guests)&&item.guests>0?item.guests+' '+(item.guests===1?'pasajero':'pasajeros'):'Pasajeros por confirmar';
 const agency=typeof item.agency==='string'?item.agency.trim():'';
 return `<article class="guest-focused brief-card" id="brief-calendar-detail"><header class="guest-focus-header"><h1>${esc(briefGuestName(item))}</h1><p class="guest-focus-meta">${esc(guests)} · ${esc(status)}</p></header>
 <div class="guest-block"><p><strong>Embarque</strong> · ${esc(guestDateLabel(item.start))}</p><p><strong>Desembarque</strong> · ${esc(guestDateLabel(item.end))}</p>${agency?`<p><strong>Origen</strong> · ${esc(agency)}</p>`:''}
 ${Array.isArray(item.extras)?item.extras.filter(x=>typeof x==='string'&&x.trim()).map(x=>`<p>${esc(x)}</p>`).join(''):''}</div>
 <p class="day-note">Por ahora solo hay datos del calendario. La ficha completa se muestra cuando la reserva esté vinculada en el CRM. Esta vista no autoriza cobros.</p></article>`;
}
function briefCalendarOpenAttr(item){
 if(item.id)return 'data-agenda-open="'+esc(item.id)+'"';
 if(!briefFromCalendar(item))return '';
 if(!briefCalendarButtons.has(item))briefCalendarButtons.set(item,String(briefCalendarButtons.size));
 return 'data-agenda-calendar="'+briefCalendarButtons.get(item)+'"';
}
function briefReservationsView(){
 const isAdmin=Boolean(session.admin),pending=opsReservations.filter(r=>r.brief?.version&&!r.brief.reviewedAt).length;
 const selected=new URLSearchParams(location.search).get('reservation');
 if(!selected&&briefCalendarSelection){
  const c=briefCalendarSelection;
  if(c.boat===boatId&&c.user===session&&c.role===role&&briefAgendaAllowed())return briefCalendarCard(c.item);
  briefCalendarSelection=null;
 }
 let rows=selected?opsReservations.filter(r=>r.id===selected):opsReservations;
 const agenda=(!selected||!rows.length)&&typeof briefAgendaEnsure==='function'&&briefAgendaAllowed()?briefAgendaEnsure():null;
 let agendaOnly=false;
 if(selected&&!rows.length){
  if(agenda?.loading)return '<p role="status">Cargando la ficha del huésped…</p>';
  if(agenda?.error)return `<p class="form-error" role="alert">${esc(agenda.error)}</p><button class="day-secondary" type="button" data-agenda-retry>Reintentar</button>`;
  const item=agenda?.rows?.find(r=>r.id===selected);
  if(!item)return '<h1>Ficha no disponible</h1><p>Volvé a la agenda para consultar las salidas de este barco.</p>';

  agendaOnly=true;
  rows=[{id:item.id,name:item.name,start:item.start,end:item.end,guests:item.guests,primaryAge:item.primaryAge,brief:{version:0},onboardPlan:item.onboardPlan,operationalPreview:briefAuthorizedAgendaPreview(item)}];
 }
 const extra=(selected?[]:agenda?.rows||[]).filter(r=>r.id&&!rows.some(known=>known.id===r.id));
 const extrasHtml=extra.map(r=>`<button type="button" class="guest-directory-row" data-agenda-open="${esc(r.id)}"><strong>${esc(r.name||'Cliente por confirmar')}</strong><small>${esc(guestDateLabel(r.start))} · ${r.briefVersion?'Ficha publicada':'Ficha en preparación'}</small></button>`).join('');
 const directoryState=selected?'':agenda?.error?`<p role="alert">${esc(agenda.error)}</p><button type="button" class="day-secondary" data-agenda-retry>Reintentar</button>`:agenda?.loading?'<p role="status">Buscando las salidas del barco…</p>':'';
 const intro=selected?'':`<h2>Huéspedes de ${esc(state.boat.name)}</h2><p>${isAdmin?'Carlota completa la ficha en el CRM y toca Listo para enviarla a la tripulación.':'Elegí un huésped para consultar su salida.'}</p>${!isAdmin&&pending?`<div class="day-note">${pending} ficha(s) pendientes de tu revisión.</div>`:''}${briefAgendaAllowed()?'<div class="ops-actions"><button type="button" class="day-secondary" data-day="ops-agenda">Agenda del mes</button></div>':''}
 ${isAdmin?'<div class="ops-actions"><button type="button" class="day-secondary" data-brief-action="external">Plantillas para otros capitanes</button></div><div id="briefExternal"></div>':''}`;
 return intro+rows.map(res=>{
  const b=res.brief||{},changed=b.sourceChanged||b.draftChanged;
  const agendaReview=isAdmin&&!agendaOnly&&selected&&briefAgendaReview?.id===res.id&&briefAgendaReview.boat===boatId&&briefAgendaReview.user===session;
  const wrapper=selected?'article':'details';
  const heading=selected?guestFocusHeader(res):`<summary>${date(res.start)} · ${esc(res.name||'Cliente pendiente')} · ${res.guests??'—'} pasajeros · ${b.version?'Versión '+b.version:'Borrador'}</summary>`;
  return `<${wrapper} class="${selected?'guest-focused':'day-disclosure'} brief-card" id="brief-${esc(res.id)}">${heading}
  ${agendaOnly?(briefOperationalPreview(res.operationalPreview)||'<p class="day-note">Podés consultar las fechas y pasajeros de esta reserva. La ficha completa no está disponible en esta vista.</p>'):''}
  ${agendaReview?'<div class="day-note">Guardar aquí solo actualiza el borrador: no publica la ficha ni autoriza cobros. Corroborá los datos y el saldo en el CRM antes de aprobar.</div><button type="button" class="day-secondary" data-day="ops-agenda">Volver a la agenda del mes</button>':''}
  ${selected&&typeof guestPlanPanel==='function'?guestPlanPanel(res):''}
  ${!selected?`<button type="button" class="day-secondary" data-agenda-open="${esc(res.id)}">Abrir ficha del huésped</button>`:''}
  ${!selected?(b.version?`<p class="day-muted">Publicada: ${briefTime(b.publishedAt)}</p>`:'<div class="day-note">Todavía no está publicada para la tripulación.</div>'):''}
  ${changed?`<div class="ops-critical">${isAdmin?'Hay cambios sin publicar. Revisá y publicá una nueva versión para solicitar otra revisión.':'El CRM cambió desde esta publicación. Administración debe actualizar la ficha; esta es la última versión publicada.'}</div>`:''}
  ${!selected||b.version||(isAdmin&&!agendaOnly)?briefContent(res,Boolean(selected)):''}
  ${isAdmin&&!agendaOnly?`<details class="day-disclosure guest-admin" ${agendaReview?'open':''}><summary>Administración · editar y ver revisiones</summary><details class="day-disclosure" ${agendaReview?'open':''}><summary>Completar o corregir la ficha</summary><form class="brief-form" data-operation="brief_save" data-id="${esc(res.id)}" data-revision="${b.revision||0}"><input type="hidden" name="revision" value="${b.revision||0}">${Object.entries(briefFields).map(([key,label])=>`<label>${label}<textarea name="${key}" maxlength="2000" rows="2">${esc(b.draft?.[key]||'')}</textarea></label>`).join('')}<p class="form-error" role="alert"></p><button type="submit" class="day-primary">Guardar borrador</button></form></details>
   <p>${['confirmed','in_progress'].includes(res.status)?'La reserva está confirmada en el CRM.':'La reserva debe confirmarse en el CRM antes de publicar la ficha.'}</p>
   <p>La publicación requiere la aprobación de Carlota en la ficha de la reserva.</p><a class="day-primary" href="https://crm.nomadsailors.com/operaciones" target="_blank" rel="noopener">Abrir reservas en el CRM</a>
   <h3>Revisión de la versión ${b.version||'pendiente'}</h3>${(b.reviews||[]).map(rv=>`<p>${esc(rv.name)} · ${esc(rv.role)}: <strong>${rv.reviewedAt?'Revisado · '+briefTime(rv.reviewedAt):'Pendiente'}</strong></p>`).join('')||'<p>No hay tripulantes asignados.</p>'}</details>`:
   b.reviewedAt?`<div class="day-note">Revisaste la versión ${b.version} el ${briefTime(b.reviewedAt)}.</div>`:
   b.version&&['capitan','chef','marinero','encargado'].includes(role)?`<button type="button" class="day-primary" data-brief-action="review" data-id="${esc(res.id)}" ${b.sourceChanged?'disabled':''}>Ya la revisé · versión ${b.version}</button>`:''}
  </${wrapper}>`;
 }).join('')+extrasHtml+directoryState+(rows.length||extra.length||directoryState?'':empty('No hay fichas disponibles para este barco.'))+
 (!selected&&isAdmin&&opsReservations.length?`<details class="day-disclosure"><summary>Asignación de capitán e instrucciones de cobro</summary>${briefLegacyReservations()}</details>`:'');
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
  if(action==='payment'&&briefCollectableAmount(res)===null)throw Error('Actualizá la ficha para verificar el cobro autorizado.');
  button.dataset.key ||=uid();
  const payload={key:button.dataset.key,id:res.id,...(action==='publish'?{revision:b.revision,sourceHash:b.sourceHash}:{version:b.version})};
  const result=await opsFetch(action==='publish'?'brief_publish':action==='payment'?'brief_payment':'brief_review',payload);
  if(action==='payment'){if(result?.payment)res.captainPayment=result.payment;briefAgenda=null;invalidateCaptainCash();}
  toast(action==='payment'?(result?.payment?.status==='cleared'?'Cobro registrado en la reserva del CRM y en tu caja.':'La recepción figura en la ficha. Revisá su estado en el CRM.'):action==='publish'?(result.unchanged?'La ficha ya estaba publicada sin cambios.':'Ficha publicada y aviso registrado.'):'Revisión confirmada en el servidor.');
  await opsAfterSave();
 }catch(e){toast(e.message);}finally{briefBusy=false;button.disabled=false;}
});

document.addEventListener('input',event=>{if(event.target.form?.matches('.brief-form'))event.target.form.dataset.dirty='true';});

// Monthly agenda of the Nomade: every charter the CRM confirms, so the captain
// sees the month ahead and opens each guest card from the same place.
let briefAgenda=null,briefAgendaBoat=null,briefAgendaLoading=false,briefAgendaError='',briefAgendaMonth='';
let briefAgendaSession=null,briefAgendaRole=null,briefAgendaRequest=0,briefAgendaDate='';
const briefMonths=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const briefToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Panama'});
const briefCurrentMonth=()=>briefToday().slice(0,7);
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
 const boat=boatId,user=session,access=role,request=++briefAgendaRequest;
 const current=()=>request===briefAgendaRequest&&boat===boatId&&user===session&&access===role;
 briefAgendaLoading=true;briefAgendaError='';
 try{
  const data=await opsFetch('agenda',null,boat);
  if(!Array.isArray(data))throw Error('No se pudo leer la agenda.');
  if(current())briefAgenda=data;
 }catch(e){if(current())briefAgendaError=e.message||'No se pudo leer la agenda.';}
 finally{
  if(current()){
   briefAgendaLoading=false;
   const selected=new URLSearchParams(location.search).get('reservation');
   if(dayPage==='ops-agenda'||(dayPage==='ops-reservations'&&selected&&!opsReservations.some(row=>row.id===selected)))render();
  }
 }
}
function briefAgendaForCurrentBoat(){
 return briefAgendaAllowed()&&briefAgendaBoat===boatId&&briefAgendaSession===session&&briefAgendaRole===role&&Array.isArray(briefAgenda)?briefAgenda:[];
}
function briefBookingColors(rows){
 const colors=['lagoon','copper','iris','blue','olive','rose'];
 const ordered=rows.filter(Boolean).slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))||String(a.id).localeCompare(String(b.id)));
 return new Map(ordered.map((row,index)=>[row,colors[index%colors.length]]));
}
// Reservations copied from the Nomade calendar (CRM, 2026-11-24) carry the guest apart from who sold
// the seat; older payloads only have the combined name.
const briefFromCalendar=item=>item?.source==='calendar';
const briefGuestName=item=>String((briefFromCalendar(item)&&'guestName' in item?item.guestName||item.agency:item.name)||'').trim()||'Cliente por confirmar';
const briefBookingDay=value=>String(value||'').slice(0,10);
const briefBookingCovers=(item,day)=>briefBookingDay(item.start)<=day&&briefBookingDay(item.end||item.start)>=day;
function briefAgendaRow(item,color){
 const age=briefAge(item.primaryAge),sent=Number(item.briefVersion)>0;
 const guests=Number.isInteger(item.guests)?`${item.guests} pasajero${item.guests===1?'':'s'}`:'Pasajeros por confirmar';
 const tag=(text,kind='')=>`<span class="agenda-tag${kind?' agenda-'+kind:''}">${esc(text)}</span>`;
 const tags=[];
 if(item.status==='in_progress')tags.push(tag('Navegando','live'));
 if(item.status==='completed')tags.push(tag('Terminado'));
 if(briefFromCalendar(item)){
  // From the boat calendar, not from a CRM sale: there is no guest card to open. Agency and Emili
  // seats never get one; a direct booking gets it once Carlota loads the sale.
  const agency=typeof item.agency==='string'&&item.agency.trim()?item.agency.trim():'';
  const kind=item.kind||(agency?'agency':'direct');
  if(kind==='seller')tags.push(tag('Venta de '+(agency||'otra vendedora'),'agency'));
  else if(kind==='agency'&&agency)tags.push(tag('Agencia · '+agency,'agency'));
  else tags.push(tag('Solo calendario','agency'));
  if(item.tentative===true)tags.push(tag('A confirmar','collect'));
 }else{
  tags.push(tag(sent?'Ficha enviada':'Ficha en preparación',sent?'ok':''));
  if(sent&&item.reviewedAt)tags.push(tag('Revisada'));
 }
 if(role==='capitan'&&item.paid!==true&&typeof item.toCollectUsd==='number'&&item.toCollectUsd>0)tags.push(tag('Cobrar '+briefMoney(item.toCollectUsd),'collect'));
 const dates=`${briefDay(item.start)||'Pendiente'} - ${briefDay(item.end)||'Pendiente'}`;
 const inner=`<span class="agenda-main"><span class="agenda-dates">${esc(dates)}</span><strong>${esc(briefGuestName(item))}${age==null?'':` (${age})`}</strong><small>${esc(guests)}</small><span class="agenda-tags">${tags.join('')}</span></span>`;
 const open=briefCalendarOpenAttr(item);
 return open?`<button type="button" class="agenda-row booking-${color}" ${open}>${inner}<span class="agenda-go" aria-hidden="true">›</span></button>`:`<div class="agenda-row agenda-pending">${inner}</div>`;
}
function briefMonthGrid(month,rows,colors){
 const [year,m]=month.split('-').map(Number);
 const offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
 const last=new Date(Date.UTC(year,m,0)).getUTCDate(),today=briefToday();
 const key=n=>month+'-'+String(n).padStart(2,'0');
 const cells=[];
 for(let first=1-offset;first<=last;first+=7){
  const begin=Math.max(1,first),end=Math.min(last,first+6);
  const lanes=[],days=[];
  for(let n=first;n<first+7;n++){
   if(n<1||n>last){days.push('<span class="agenda-blank" aria-hidden="true"></span>');continue;}
   const day=key(n),count=rows.filter(r=>briefBookingCovers(r,day)).length;
   const label=n+' de '+briefMonthName(month)+', '+count+(count===1?' reserva':' reservas');
   days.push(`<button type="button" class="agenda-day" data-agenda-day="${day}" aria-label="${esc(label)}" aria-pressed="${day===briefAgendaDate}"${day===today?' aria-current="date"':''}><span>${n}</span></button>`);
  }
  const stays=rows.filter(item=>briefBookingDay(item.start)<=key(end)&&briefBookingDay(item.end||item.start)>=key(begin)).map(item=>{
   const start=briefBookingDay(item.start),finish=briefBookingDay(item.end||item.start);
   const from=start<key(begin)?begin:Number(start.slice(8)),to=finish>key(end)?end:Number(finish.slice(8));
   const name=briefGuestName(item),label=name+' · '+(briefDay(item.start)||'Pendiente')+' – '+(briefDay(item.end)||'Pendiente');
   let lane=lanes.findIndex(previous=>previous<from);if(lane<0)lane=lanes.length;
   lanes[lane]=to;
   const style='grid-column:'+(from-first+1)+' / span '+(to-from+1)+';grid-row:'+(lane+1);
   const cls='agenda-stay booking-'+colors.get(item),span=to-from+1;
   const words=name.split(/\s+/),initials=words[0].slice(0,1)+(words.length>1?words[words.length-1].slice(0,1):'');
   const compact=span===1?initials.toLocaleUpperCase('es'):span===2?words[0]:name;
   const open=briefCalendarOpenAttr(item);
   return open?`<button type="button" class="${cls}" style="${style}" ${open} aria-label="${esc('Abrir ficha de '+label)}" title="${esc(label)}">${esc(compact)}</button>`:`<span class="${cls}" style="${style}" title="${esc(label)}">${esc(compact)}</span>`;
  });
  cells.push('<div class="agenda-week"><div class="agenda-days">'+days.join('')+'</div>'+(stays.length?'<div class="agenda-ranges">'+stays.join('')+'</div>':'')+'</div>');
 }
 const weekdays=['Lu','Ma','Mi','Ju','Vi','Sá','Do'];
 return '<div class="agenda-board" role="group" aria-label="Calendario de '+esc(briefMonthName(month))+'"><div class="agenda-weekdays" aria-hidden="true">'+weekdays.map(d=>'<span>'+d+'</span>').join('')+'</div>'+cells.join('')+'</div>';
}
function briefAgendaEnsure(){
 const full=briefAgendaAllowed();
 if(briefAgendaBoat!==boatId||briefAgendaSession!==session||briefAgendaRole!==role){
  briefAgendaRequest++;briefAgenda=null;briefAgendaError='';briefAgendaLoading=false;briefAgendaDate='';
  briefAgendaBoat=boatId;briefAgendaSession=session;briefAgendaRole=role;
 }
 if(full && briefAgenda===null && !briefAgendaLoading && !briefAgendaError)briefAgendaLoad();
 return {rows:briefAgendaForCurrentBoat(),loading:full&&briefAgendaLoading,error:full?briefAgendaError:''};
}
function briefAgendaView(){
 briefCalendarButtons=new Map();briefCalendarSelection=null;
 const full=briefAgendaAllowed();
 briefAgendaEnsure();
 const rows = full ? briefAgenda : opsReservations.filter(r => r.brief?.version > 0).map(r => ({
   id:r.id, name:r.name, start:r.start, end:r.end, guests:r.guests, briefVersion:r.brief.version, reviewedAt:r.brief.reviewedAt
 }));
 const month=briefAgendaMonth||briefCurrentMonth();
 let body;
 if(full&&briefAgendaError)body=`<p class="form-error" role="alert">${esc(briefAgendaError)}</p><button type="button" class="day-secondary" data-agenda-retry>Reintentar</button>`;
 else if(rows===null)body='<p class="day-muted" role="status">Cargando agenda…</p>';
 else{
  const monthRows=rows.filter(item=>item&&briefInMonth(item,month)).sort((a,b)=>String(a.start).localeCompare(String(b.start))||briefGuestName(a).localeCompare(briefGuestName(b),'es'));
  const selected=briefAgendaDate.slice(0,7)===month?briefAgendaDate:'';
  const list=selected?monthRows.filter(item=>briefBookingCovers(item,selected)):monthRows;
  const label=selected?'Reservas del '+Number(selected.slice(8))+' de '+briefMonths[Number(month.slice(5))-1].toLowerCase():'Reservas del mes';
  const undated=rows.filter(item=>item&&!briefMonthKey(item.start));
  const colors=briefBookingColors(rows);
  const card=item=>briefAgendaRow(item,colors.get(item));
  body=`<section class="agenda-results" aria-labelledby="agenda-results-title"><div class="agenda-section-head"><h2 id="agenda-results-title" tabindex="-1">${esc(label)} <span>(${list.length})</span></h2>${selected?'<button type="button" class="agenda-text" data-agenda-all>Ver todo el mes</button>':''}</div><div class="agenda-list">${list.map(card).join('')||empty(selected?'No hay reservas para ese día.':full?'No hay charters confirmados este mes.':'No hay fichas de huéspedes publicadas para este mes.')}</div></section>`+
   '<details class="day-disclosure" data-agenda-calendar-toggle '+(briefAgendaCalendarOpen?'open':'')+'><summary>Ver calendario</summary>'+briefMonthGrid(month,monthRows,colors)+'</details>';
  if(undated.length)body+='<details class="day-disclosure"><summary>Reservas sin fecha ('+undated.length+')</summary><div class="agenda-list">'+undated.map(card).join('')+'</div></details>';
 }
 return `<h1>Agenda del mes</h1><section class="agenda-calendar"><div class="agenda-nav"><h2 aria-live="polite">${briefMonthName(month)}</h2><div><button type="button" class="agenda-today" data-agenda-today>Hoy</button><button type="button" data-agenda-month="${briefShiftMonth(month,-1)}" aria-label="Mes anterior">‹</button><button type="button" data-agenda-month="${briefShiftMonth(month,1)}" aria-label="Mes siguiente">›</button></div></div>${body}</section>${session.admin?'<details class="day-disclosure"><summary>Más opciones</summary><button type="button" class="day-secondary" data-day="ops-reservations">Fichas de huéspedes</button></details>':''}`;
}
document.addEventListener('toggle',event=>{if(event.target.matches?.('[data-agenda-calendar-toggle]'))briefAgendaCalendarOpen=event.target.open;},true);
document.addEventListener('click',event=>{
 const month=event.target.closest('[data-agenda-month]');
 if(month){
  const direction=month.dataset.agendaMonth<(briefAgendaMonth||briefCurrentMonth())?-1:1;
  briefAgendaDate='';briefAgendaMonth=month.dataset.agendaMonth;render();
  document.querySelector('[data-agenda-month="'+briefShiftMonth(briefAgendaMonth,direction)+'"]')?.focus({preventScroll:true});
  return;
 }
 if(event.target.closest('[data-agenda-retry]')){briefAgendaError='';render();return;}
 if(event.target.closest('[data-agenda-all]')){briefAgendaDate='';render();document.querySelector('#agenda-results-title')?.focus();return;}
 const day=event.target.closest('[data-agenda-day]'),today=event.target.closest('[data-agenda-today]');
 if(day||today){
  briefAgendaDate=day?day.dataset.agendaDay:briefToday();briefAgendaMonth=briefAgendaDate.slice(0,7);
  render();document.querySelector('#agenda-results-title')?.focus();return;
 }
 const open=event.target.closest('[data-agenda-open],[data-agenda-calendar]');if(!open)return;
 dayGuestCashOwner=dayPage==='ops-cash' && canViewCash() ? {boat:boatId,user:session} : null;
 const id=open.dataset.agendaOpen;
 const params=new URLSearchParams(location.search);
 if(id){briefCalendarSelection=null;params.set('reservation',id);}
 else{
  const item=[...briefCalendarButtons].find(([,key])=>key===open.dataset.agendaCalendar)?.[0];
  if(!item||!briefAgendaAllowed())return;
  params.delete('reservation');briefCalendarSelection={item,boat:boatId,user:session,role};
 }
 briefAgendaReview=null; // A tap opens a readable fiche, never the administration editor.
 const search=params.toString();
 history.replaceState(null,'',location.pathname+(search?'?'+search:''));
 dayPage='ops-reservations';render();
 window.scrollTo(0,0);
});
// Refreshing the operations data also refreshes the agenda (a payment or a new
// confirmation changes it). Guarded so the card renders in isolated tests.
if(typeof opsReload==='function'){const briefOpsReload=opsReload;opsReload=function(){briefAgendaRequest++;briefAgendaLoading=false;briefAgenda=null;briefAgendaError='';return briefOpsReload.apply(this,arguments);};}
