"use strict";
const boatDraftDB=new Promise((resolve,reject)=>{const request=indexedDB.open('boat-form-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function draftRead(key){const db=await boatDraftDB;return new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function draftWrite(key,value){const db=await boatDraftDB;return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');if(value===null)tx.objectStore('drafts').delete(key);else tx.objectStore('drafts').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function draftKey(form){
 if(!form||!session||!boatId)return '';
 const identity=form.matches('.ops-form')?[form.dataset.operation,form.dataset.id||form.elements.productId?.value||'new'].join(':'):form.id==='dayForm'?[form.dataset.kind,['task','blocked','missing'].includes(form.dataset.kind)?daySelected:'new'].join(':'):form.id==='editorForm'&&editing?[editing.type,editing.id||'new'].join(':'):'';
 return identity?[session.id,boatId,identity].join(':'):'';
}
async function draftSave(form){
 const key=draftKey(form);if(!key)return;
 const values={};for(const field of form.elements){if(!field.name||field.type==='password')continue;values[field.name]=field.type==='file'?[...field.files]:field.type==='checkbox'?field.checked:field.value;}
 await draftWrite(key,{values,pending:form._opsPending||null,time:new Date().toISOString()});
}
let draftTimer;
document.addEventListener('input',event=>{const form=event.target.form;if(!form||!draftKey(form))return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>draftSave(form).catch(()=>toast('No se pudo guardar el borrador local. Conservá esta pantalla.')),400);});
document.addEventListener('change',event=>{const form=event.target.form;if(form&&draftKey(form))draftSave(form).catch(()=>{});});
const draftForms=new WeakSet();
new MutationObserver(()=>{
 if(session&&boatId&&dayPage==='home'&&!document.querySelector('#pendingStateCheck')){
  const marker=document.createElement('div');marker.id='pendingStateCheck';document.querySelector('.day-content')?.prepend(marker);
  const key=`pending-state:${session.id}:${boatId}`;
  draftRead(key).then(pending=>{if(!pending||!marker.isConnected)return;marker.className='day-note';marker.textContent='Hay un guardado sin confirmar. ';
   const recover=document.createElement('button');recover.type='button';recover.textContent='Revisar guardado pendiente';recover.onclick=async()=>{
    recover.disabled=true;
    try{const saved=await api('state?boat='+encodeURIComponent(boatId),'PUT',pending);await draftWrite(key,null);if(pending.draftKey)await draftWrite(pending.draftKey,null);state=saved.state;revision=saved.revision;render();toast('Guardado confirmado, sin duplicarlo.');}
    catch(e){if(e.status===409){await draftWrite(key,null);toast('El servidor cambió. Recuperá el borrador del formulario y revisá los datos antes de enviarlo.');marker.remove();}else toast(e.message);}
    finally{recover.disabled=false;}
   };marker.append(recover);
  }).catch(()=>{});
 }
 document.querySelectorAll('#dayForm,.ops-form,#editorForm').forEach(form=>{
  if(!form.querySelector('[name]')||draftForms.has(form.querySelector('[name]'))||!draftKey(form)||form.closest('#legacyReview'))return;draftForms.add(form.querySelector('[name]'));
  const key=draftKey(form);
  draftRead(key).then(saved=>{
   if(!saved||!form.isConnected||key!==draftKey(form))return;
   const box=document.createElement('div');box.className='day-note';box.textContent='Hay un borrador guardado en este dispositivo. ';
   const restore=document.createElement('button');restore.type='button';restore.textContent='Recuperar';
   restore.onclick=()=>{for(const [name,value] of Object.entries(saved.values)){const field=form.elements.namedItem(name);if(!field)continue;if(field.type==='file'){const transfer=new DataTransfer();value.forEach(file=>transfer.items.add(file));field.files=transfer.files;}else if(field.type==='checkbox')field.checked=value;else field.value=value;}form._opsPending=saved.pending;box.remove();toast('Borrador recuperado. Revisalo antes de guardar.');};
   const discard=document.createElement('button');discard.type='button';discard.textContent='Descartar';discard.onclick=async()=>{if(saved.pending){toast('Hay un envío sin confirmar. Recuperalo y reintentá antes de descartarlo.');return;}await draftWrite(key,null);box.remove();};
   box.append(restore,discard);form.prepend(box);
  }).catch(()=>{});
 });
}).observe(document.body,{childList:true,subtree:true});
window.addEventListener('offline',()=>toast('Sin conexión. Los formularios quedan como borradores en este dispositivo.'));
window.addEventListener('online',()=>toast('Conexión recuperada. Revisá y guardá tu borrador.'));
