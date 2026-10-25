"use strict";
let briefExternal=null,briefBusy=false;
const briefFields={country:'País de procedencia',airConditioning:'Aire acondicionado (sí, no o por confirmar)',embarkation:'Lugar de embarque',embarkationTime:'Hora de embarque (hora local)',disembarkation:'Lugar de desembarque',disembarkationTime:'Hora de desembarque / salida tardía',food:'Dieta específica',allergies:'Alergias / alimentos a evitar',drinks:'Bebidas preferidas',activities:'Experiencia deseada',transport:'Cómo llegan / traslado',requests:'Preparación y pedidos especiales'};
const briefMissing=value=>value===null||value===undefined||value===''?'Pendiente de informar':String(value);
const briefInterest=value=>({snorkeling:'Esnórquel',diving:'Buceo',guna_culture:'Cultura guna',fishing:'Pesca',relax:'Descanso',sailing:'Navegación',gastronomy:'Gastronomía',remote_islands:'Islas remotas',family_activities:'Actividades en familia',other:'Otros'})[value]||value;
const briefTime=value=>value?new Date(value).toLocaleString('es',{dateStyle:'short',timeStyle:'short'}):'Pendiente';
function briefContent(res){
 const details=res.details||res.brief?.draft||{},legacy=res.legacyPreferences||{},passengers=res.passengers||[];
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
 const requests=joined([details.requests,...named('requests')]);
 const names=joined(passengers.map(p=>p.name));
 const guests=res.guests==null?'Cantidad pendiente':`${res.guests} pasajero${res.guests===1?'':'s'}`;
 const experience=joined([details.activities,legacy.activities,...(res.interests||[]).map(briefInterest)]);
 return `<article class="guest-sheet" aria-label="Información del huésped">
 <h3>Información del huésped</h3>
 <dl class="guest-facts">${facts('Fecha del charter',`${res.start?date(res.start):pending} → ${res.end?date(res.end):pending}`)}${facts('Cliente principal',value(res.name))}${facts('Pasajeros / acompañantes',`${guests}${names?' · '+names:' · Nombres pendientes'}`)}${facts('País de procedencia',value(details.country))}</dl>
 <div class="guest-block">${row('Aire acondicionado',value(details.airConditioning))}${row('Llegada',joined([details.transport,details.embarkation,details.embarkationTime]))}${row('Salida',joined([details.disembarkation,details.disembarkationTime]))}</div>
 <div class="guest-block"><h4>Comidas y bebidas</h4>${row('A evitar',avoid,Boolean(avoid))}${row('Prefieren beber',joined([details.drinks,legacy.drinks]))}${row('Dieta específica',diet)}</div>
 <div class="guest-block">${row('Experiencia',experience)}${requests?row('Para recibirlos',requests):''}</div>
 </article>${(role!=='capitan'&&('phone' in res))?`<details class="day-disclosure guest-contact"><summary>Contacto del cliente</summary><p>${esc(joined([res.phone,res.email])||pending)}</p></details>`:''}`;
}
function briefReservationsView(){
 const isAdmin=Boolean(session.admin),pending=opsReservations.filter(r=>r.brief?.version&&!r.brief.reviewedAt).length;
 return `<h2>Huéspedes de ${esc(state.boat.name)}</h2><p>${isAdmin?'Carlota completa la ficha en el CRM y toca Listo para enviarla a la tripulación.':'Abrí la ficha para preparar la llegada y confirmá que la revisaste.'}</p>${!isAdmin&&pending?`<div class="day-note">${pending} ficha(s) pendientes de tu revisión.</div>`:''}
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
  button.dataset.key ||=uid();
  const payload={key:button.dataset.key,id:res.id,...(action==='publish'?{revision:b.revision,sourceHash:b.sourceHash}:{version:b.version})};
  const result=await opsFetch(action==='publish'?'brief_publish':'brief_review',payload);
  toast(action==='publish'?(result.unchanged?'La ficha ya estaba publicada sin cambios.':'Ficha publicada y aviso registrado.'):'Revisión confirmada en el servidor.');
  await opsAfterSave();
 }catch(e){toast(e.message);}finally{briefBusy=false;button.disabled=false;}
});

document.addEventListener('input',event=>{if(event.target.form?.matches('.brief-form'))event.target.form.dataset.dirty='true';});
