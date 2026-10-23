"use strict";
let briefExternal=null,briefBusy=false;
const briefFields={embarkation:'Lugar de embarque',embarkationTime:'Hora de embarque (hora local)',disembarkation:'Lugar de desembarque',disembarkationTime:'Hora de desembarque (hora local)',food:'Alimentación adicional',allergies:'Alergias y restricciones confirmadas',drinks:'Bebidas',activities:'Actividades acordadas',transport:'Traslado y coordinación',requests:'Pedidos especiales y preparativos'};
const briefMissing=value=>value===null||value===undefined||value===''?'Pendiente de informar':String(value);
const briefInterest=value=>({snorkeling:'Esnórquel',diving:'Buceo',guna_culture:'Cultura guna',fishing:'Pesca',relax:'Descanso',sailing:'Navegación',gastronomy:'Gastronomía',remote_islands:'Islas remotas',family_activities:'Actividades en familia',other:'Otros'})[value]||value;
const briefTime=value=>value?new Date(value).toLocaleString('es',{dateStyle:'short',timeStyle:'short'}):'Pendiente';
function briefContent(res){
 const details=res.details||res.brief?.draft||{};
 return `<div class="brief-facts"><p><strong>Cliente</strong><br>${esc(briefMissing(res.name))}</p><p><strong>Pasajeros</strong><br>${esc(briefMissing(res.guests))}</p><p><strong>Ingreso</strong><br>${date(res.start)}</p><p><strong>Salida</strong><br>${date(res.end)}</p></div>${('phone' in res)?`<p><strong>Contacto principal:</strong> ${esc(briefMissing(res.phone))} · ${esc(briefMissing(res.email))}</p>`:''}
 <p><strong>Observaciones operativas:</strong> ${esc(briefMissing(res.notes))}</p>
 <h3>Pasajeros y alimentación</h3>${(res.passengers||[]).map(p=>`<article class="day-inventory"><strong>${esc(briefMissing(p.name))}</strong><p>Alimentación: ${esc(briefMissing(p.food))}</p><p class="${p.avoid?'ops-critical':''}">Restricciones / evitar: ${esc(briefMissing(p.avoid))}</p><p>Pedidos: ${esc(briefMissing(p.requests))}</p></article>`).join('')||'<p>Pendiente de informar los pasajeros y sus restricciones.</p>'}
 <p><strong>Intereses:</strong> ${esc(briefMissing((res.interests||[]).map(briefInterest).join(', ')))}</p>
 ${Object.entries(res.legacyPreferences||{}).filter(([,v])=>v).map(([k,v])=>`<p><strong>${esc(({food:'Alimentación',allergies:'Alergias',drinks:'Bebidas',activities:'Actividades'})[k]||k)} (registro previo):</strong> ${esc(v)}</p>`).join('')}
 ${Object.entries(briefFields).map(([key,label])=>`<p class="${key==='allergies'&&details[key]?'ops-critical':''}"><strong>${label}:</strong> ${esc(briefMissing(details[key]))}</p>`).join('')}`;
}
function briefReservationsView(){
 const isAdmin=Boolean(session.admin),pending=opsReservations.filter(r=>r.brief?.version&&!r.brief.reviewedAt).length;
 return `<h2>Reservas de ${esc(state.boat.name)}</h2><p>${isAdmin?'Carlota revisa y aprueba cada ficha desde la reserva del CRM. Después le pide a Claudio que la publique aquí. Los cambios guardados quedan en borrador y requieren nueva aprobación.':'Estas son las fichas publicadas para la tripulación del Nomade. Abrí cada ficha y confirmá que revisaste su versión actual.'}</p>${!isAdmin&&pending?`<div class="day-note">${pending} ficha(s) pendientes de tu revisión.</div>`:''}
 ${isAdmin?'<div class="ops-actions"><button type="button" class="day-secondary" data-brief-action="external">Plantillas para otros capitanes</button></div><div id="briefExternal"></div>':''}
 ${opsReservations.map(res=>{
  const b=res.brief||{},changed=b.sourceChanged||b.draftChanged;
  return `<details class="day-disclosure brief-card" id="brief-${esc(res.id)}" ${new URLSearchParams(location.search).get('reservation')===res.id?'open':''}><summary>${date(res.start)} · ${esc(res.name||'Cliente pendiente')} · ${res.guests??'—'} pasajeros · ${b.version?'Versión '+b.version:'Borrador'}</summary>
  ${b.version?`<p class="day-muted">Publicada: ${briefTime(b.publishedAt)}</p>`:'<div class="day-note">Todavía no está publicada para la tripulación.</div>'}
  ${changed?`<div class="ops-critical">${isAdmin?'Hay cambios sin publicar. Revisá y publicá una nueva versión para solicitar otra revisión.':'El CRM cambió desde esta publicación. Administración debe actualizar la ficha; esta es la última versión publicada.'}</div>`:''}
  ${briefContent(res)}
  ${isAdmin?`<details class="day-disclosure"><summary>Completar o corregir la ficha</summary><form class="brief-form" data-operation="brief_save" data-id="${esc(res.id)}" data-revision="${b.revision||0}"><input type="hidden" name="revision" value="${b.revision||0}">${Object.entries(briefFields).map(([key,label])=>`<label>${label}<textarea name="${key}" maxlength="2000" rows="2">${esc(b.draft?.[key]||'')}</textarea></label>`).join('')}<p class="form-error" role="alert"></p><button type="submit" class="day-primary">Guardar borrador</button></form></details>
   <p>${['confirmed','in_progress'].includes(res.status)?'La reserva está confirmada en el CRM.':'La reserva debe confirmarse en el CRM antes de publicar la ficha.'}</p>
   <p>La publicación requiere la aprobación de Carlota en la ficha de la reserva.</p><a class="day-primary" href="https://crm.nomadsailors.com/operaciones" target="_blank" rel="noopener">Abrir reservas en el CRM</a>
   <h3>Revisión de la versión ${b.version||'pendiente'}</h3>${(b.reviews||[]).map(rv=>`<p>${esc(rv.name)} · ${esc(rv.role)}: <strong>${rv.reviewedAt?'Revisado · '+briefTime(rv.reviewedAt):'Pendiente'}</strong></p>`).join('')||'<p>No hay tripulantes asignados.</p>'}`:
   b.reviewedAt?`<div class="day-note">Revisaste la versión ${b.version} el ${briefTime(b.reviewedAt)}.</div>`:
   ['capitan','chef','marinero','encargado'].includes(role)?`<button type="button" class="day-primary" data-brief-action="review" data-id="${esc(res.id)}" ${b.sourceChanged?'disabled':''}>Revisé la ficha · versión ${b.version}</button>`:''}
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
