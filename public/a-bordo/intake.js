"use strict";
let intakeStartKind='';
let intakeDocs=null,intakeLoading=false,intakeBusy=false,intakeError='',intakeDraft=null,intakeBoat='',intakeRestore=null;
let intakeLoadVersion=0;
const intakeNames={count:'Conteo de existencias',purchase:'Ticket de compra recibida',expense:'Gasto sin entrada de stock',request:'Lista de faltantes'};
const intakeStatuses={pending:'Pendiente de revisión',applied:'Confirmada',rejected:'Descartada'};
function intakeContext() {
 const user=session?.id, boat=boatId, draftKey='intake:'+user+':'+boat;
 return {boat, draftKey, pendingKey:'pending-'+draftKey, active:()=>Boolean(session?.admin && session.id===user && boatId===boat)};
}
// One pending request per device, account and boat, including across browser tabs.
async function intakeClaim(context, doc) {
 const db=await boatDraftDB;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'), store=tx.objectStore('drafts');
  const read=store.get(context.pendingKey);
  let claimed=false;
  read.onsuccess=()=>{
   if(read.result?.pending?.payload.key===doc.pending.payload.key) claimed=true;
   else if(!read.result){store.put(doc,context.pendingKey);claimed=true;}
  };
  tx.oncomplete=()=>resolve(claimed);
  tx.onabort=()=>reject(tx.error||Error('No se pudo conservar el guardado en este dispositivo.'));
 });
}
async function intakeRelease(context, doc, completed) {
 const db=await boatDraftDB;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('drafts','readwrite'), store=tx.objectStore('drafts');
  const pending=store.get(context.pendingKey);
  pending.onsuccess=()=>{
   if(pending.result?.pending?.payload.key===doc.pending.payload.key)store.delete(context.pendingKey);
  };
  const prep=store.get(context.draftKey);
  prep.onsuccess=()=>{
   if(!prep.result || doc.id) return;
   if(prep.result.preparationKey!==doc.preparationKey || (!doc.preparationKey && prep.result.pending?.payload.key!==doc.pending.payload.key)) return;
   if(completed)store.delete(context.draftKey);
   else {const editable={...doc};delete editable.pending;store.put(editable,context.draftKey);}
  };
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(tx.error||Error('No se pudo actualizar el borrador.'));
 });
}
async function intakeFetch(op,payload,boat=boatId){
 const response=await fetch('/api/boat-intake/'+op+(payload?'':'?boat='+encodeURIComponent(boat)),{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify({...payload,boat}):undefined});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'No se pudo confirmar la carga'),{status:response.status});return result;
}
async function intakeReload(){
 if(!session?.admin){intakeDocs=null;intakeDraft=null;return;}
 const context=intakeContext(), version=++intakeLoadVersion;
 const active=()=>context.active()&&version===intakeLoadVersion;
 intakeLoading=true;
 try{
  const [docs,pending,prep]=await Promise.all([intakeFetch('list',undefined,context.boat),draftRead(context.pendingKey),draftRead(context.draftKey)]);
  if(!active())return;
  intakeDocs=docs;intakeError='';intakeRestore=pending||prep;
  if(intakeRestore?.pending && !intakeBusy)intakeDraft=intakeRestore;
 }catch(e){if(active())intakeError=e.message;}
 finally{if(active()){intakeLoading=false;if(dayPage==='ops-intake')render();}}
}
function intakeInput(label,name,value='',type='text',attrs=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;}
function intakeView(){
 if(!session?.admin)return '<p class="day-note">El administrador carga y confirma los tickets y las existencias.</p>';
 const scope=intakeContext().draftKey;
 if(intakeBoat!==scope){intakeBoat=scope;intakeLoadVersion++;intakeLoading=false;intakeDocs=null;intakeDraft=null;intakeRestore=null;intakeError='';}
 if(!intakeDocs&&!intakeLoading&&!intakeError)intakeReload();
 if(intakeDraft)return intakeReviewView();
 if(!intakeDocs&&intakeLoading)return '<h1>Tickets, fotos y listas</h1><p role="status">Buscando las cargas y los guardados pendientes de este barco…</p>';
 return `<h1>Tickets, fotos y listas</h1><p>Elegí qué representa el documento. La lectura prepara las filas para revisar; las cantidades cambian al confirmar la carga.</p>${intakeError?`<p class="form-error" role="alert">${esc(intakeError)}</p>`:''}${intakeRestore?'<div class="day-note">Hay una preparación guardada en este dispositivo. <button data-intake="restore">Recuperarla</button></div>':''}${session.admin?`<form id="intakeInput"><label>¿Qué vas a cargar?<select name="kind" required><option value="">Elegí una opción</option>${Object.entries(intakeNames).map(([k,v])=>`<option value="${k}" ${k===intakeStartKind?'selected':''}>${v}</option>`).join('')}</select></label><p class="day-muted">Conteo reemplaza la cantidad de las filas incluidas. Compra recibida suma existencias y registra el gasto. Si la mercadería ya fue cargada por recepción de un pedido, elegí Gasto sin entrada de stock.</p><label>Adjuntar fotos o una lista<input name="files" type="file" accept="image/jpeg,image/png,image/webp,.txt,.csv" multiple><small>Hasta 3 fotos claras, o un archivo TXT/CSV. Para una planilla, copiá las celdas y pegalas abajo.</small></label><label>Lista o texto del comprobante<textarea name="text" maxlength="30000" placeholder="Producto; cantidad; unidad; ubicación; precio unitario (opcional)"></textarea></label><p class="day-muted">También podés escribir una línea por producto, por ejemplo: cantidad + unidad + producto. No uses cantidades de ejemplo como stock real.</p><p class="form-error" role="alert"></p><button class="day-primary" type="submit">Leer y preparar carga</button><p id="intakeProgress" role="status"></p></form>`:''}<h2>Cargas compartidas del barco</h2>${intakeLoading?'<p>Cargando…</p>':(intakeDocs||[]).map(doc=>`<article class="day-inventory"><h3>${esc(intakeNames[doc.kind])}</h3><p>${esc(intakeStatuses[doc.status])} · ${esc(doc.author)} · ${date(doc.created_at)}</p><p>${doc.data.items.length} filas${doc.data.supplier?' · '+esc(doc.data.supplier):''}</p><button class="day-secondary" data-intake="open" data-id="${doc.id}">Ver y revisar</button></article>`).join('')||empty('No hay fotos o listas cargadas todavía.')}`;
}
function intakeReviewView(){
 if(!session?.admin)return '<p class="day-note">Solo el administrador puede revisar esta carga.</p>';
 const doc=intakeDraft,data=doc.data,canEdit=!doc.id||(doc.status==='pending'&&(Boolean(session?.admin)||(doc.kind==='request'&&doc.created_by===session.id)));
 const money=['purchase','expense'].includes(doc.kind);
 return `<button class="day-back" data-intake="back">← Fotos y listas</button><h1>${esc(intakeNames[doc.kind])}</h1><p>${doc.id?esc(intakeStatuses[doc.status]):'Revisá lo leído antes de enviarlo.'}</p>${doc.pending?'<p class="day-note">Hay un guardado sin confirmar. Volvé a verificarlo para recuperar el resultado sin duplicar cantidades.</p>':''}${doc.notice?`<p class="day-note">${esc(doc.notice)}</p>`:''}${doc.source.photos.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener"><img class="day-reference" src="${esc(url)}" alt="Comprobante o lista adjunta"></a>`).join('')}<details class="day-disclosure"><summary>Ver texto de origen</summary><div class="manual-content">${esc(doc.source.text)}</div></details><form id="intakeReview"><fieldset ${canEdit&&!doc.pending?'':'disabled'} style="border:0;padding:0;min-width:0">${intakeInput('Fecha del conteo, compra o lista','date',data.date,'date',`required max="${today()}"`)}${money?intakeInput('Proveedor','supplier',data.supplier,'text','required maxlength="140"')+intakeInput('Número de comprobante (si tiene)','reference',data.reference,'text','maxlength="140"')+`<label>Moneda<select name="currency" required><option value="">Confirmá la moneda</option>${['USD','EUR','ARS','PAB'].map(c=>`<option ${c===data.currency?'selected':''}>${c}</option>`).join('')}</select></label>`+intakeInput('Total del comprobante','total',data.total,'number','required min="0" max="1000000000" step="0.01"'):''}${doc.kind!=='expense'?`<label>Completar área en las filas vacías<select id="intakeBulkArea"><option value="">Elegí el área</option><option value="gastronomia">Bebidas y mercadería</option><option value="tecnica">Materiales, repuestos y limpieza</option></select></label>${doc.kind!=='request'?'<label>Completar ubicación en las filas vacías<input id="intakeBulkLocation" placeholder="Ubicación real"></label><button type="button" class="day-secondary" data-intake="bulk">Completar filas vacías</button>':''}<div id="intakeRows">${data.items.map((row,i)=>`<article class="day-inventory" data-intake-row="${i}"><h3>Producto ${i+1}</h3><label>Vincular con un insumo existente<select name="productId"><option value="">Detectar coincidencia exacta o crear nuevo</option>${state.products.map(p=>`<option value="${esc(p.id)}" ${p.id===row.productId?'selected':''}>${esc(p.name)} · ${esc(p.unit)} · ${esc(p.location)}</option>`).join('')}</select></label>${intakeInput('Producto','name',row.name,'text','required maxlength="140"')}${intakeInput(doc.kind==='count'?'Cantidad contada':'Cantidad','quantity',row.quantity,'number',`required min="${doc.kind==='count'?'0':'0.0001'}" max="1000000000" step="0.0001"`)}${intakeInput('Unidad','unit',row.unit,'text','required maxlength="20"')}<label>Área<select name="area" required><option value="">Confirmá el área</option><option value="gastronomia" ${row.area==='gastronomia'?'selected':''}>Bebidas y mercadería</option><option value="tecnica" ${row.area==='tecnica'?'selected':''}>Materiales, repuestos y limpieza</option></select></label>${doc.kind!=='request'?intakeInput('Ubicación','location',row.location,'text','required maxlength="140"'):''}${doc.kind==='purchase'?intakeInput('Precio por unidad (vacío si no se conoce)','unitCost',row.unitCost,'number','min="0" max="1000000000" step="0.0001"'):''}<button type="button" class="day-text" data-intake="remove" data-index="${i}">Quitar esta fila</button></article>`).join('')}</div><button type="button" class="day-secondary" data-intake="add">＋ Agregar fila</button>`:''}<label>Observaciones y dudas<textarea name="notes" maxlength="3000">${esc(data.notes)}</textarea></label></fieldset><p class="form-error" role="alert"></p>${canEdit?`<label class="check"><input name="confirmed" type="checkbox" required>${doc.kind==='purchase'?'Revisé cantidades, unidades, precios y moneda. La mercadería fue recibida y todavía no se cargó al stock.':doc.kind==='count'?'Revisé el conteo real. Reemplazará las existencias de las filas incluidas.':doc.kind==='expense'?'Revisé proveedor, fecha, moneda e importe. Este gasto no debe sumar stock.':'Revisé los productos, cantidades y unidades solicitados.'}</label><button class="day-primary" type="submit">${doc.pending?'Verificar guardado pendiente':doc.id?(doc.kind==='request'?'Crear faltantes':'Confirmar y actualizar'):doc.kind==='purchase'&&Boolean(session?.admin)?'Confirmar ticket y sumar al stock':'Enviar carga revisada'}</button>`:''}${doc.id&&doc.status==='pending'&&Boolean(session?.admin)?'<button type="button" class="day-text" data-intake="reject">Descartar carga</button>':''}</form>${!doc.id?'<p class="day-muted">'+(doc.kind==='purchase'&&Boolean(session?.admin)?'Al confirmar se suman los productos recibidos y se registra el gasto en una sola operación.':'El administrador revisa y confirma esta carga antes de actualizar las existencias o los gastos.')+'</p>':''}`;
}
function intakeRead(form){
 if(intakeDraft.pending)return intakeDraft.data;
 const data={...intakeDraft.data};for(const key of ['date','supplier','reference','currency','notes'])if(form.elements.namedItem(key)&&!['name'].includes(key))data[key]=form.elements.namedItem(key).value.trim();
 if(form.elements.total)data.total=form.elements.total.value===''?null:Number(form.elements.total.value);
 if(intakeDraft.kind!=='expense')data.items=[...form.querySelectorAll('[data-intake-row]')].map(el=>{const get=n=>el.querySelector('[name="'+n+'"]')?.value.trim()||'';return {name:get('name'),quantity:get('quantity')===''?null:Number(get('quantity')),unit:get('unit'),location:get('location'),area:get('area'),productId:get('productId'),unitCost:get('unitCost')===''?null:Number(get('unitCost'))};});
 intakeDraft.data=data;return data;
}
async function intakeRemember(context=intakeContext(),doc=intakeDraft){
 if(doc&&!doc.id&&!doc.pending){
  doc.preparationKey ||= uid();
  await draftWrite(context.draftKey,doc);
 }
}
let intakeRememberTimer;
document.addEventListener('input',e=>{if(e.target.closest('#intakeReview')){intakeRead(e.target.closest('form'));const context=intakeContext(),doc=intakeDraft;clearTimeout(intakeRememberTimer);intakeRememberTimer=setTimeout(()=>intakeRemember(context,doc).catch(()=>{}),300);}});
async function intakeOcr(images,progress){
 if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/a-bordo/ocr/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar el lector de fotos. Revisá la conexión.'));document.head.append(script);});
 const worker=await Tesseract.createWorker(['spa','eng'],1,{workerPath:'/a-bordo/ocr/worker.min.js',corePath:'/a-bordo/ocr',langPath:'/a-bordo/ocr',logger:m=>{if(progress?.isConnected)progress.textContent='Leyendo foto… '+Math.round((m.progress||0)*100)+'%';}});
 try{const text=[];for(const image of images)text.push((await worker.recognize(image)).data.text);return text.join('\n');}finally{await worker.terminate();}
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['intakeInput','intakeReview'].includes(form.id))return;event.preventDefault();if(!session?.admin||intakeBusy||!form.reportValidity())return;
 const context=intakeContext();
 intakeBusy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;const error=form.querySelector('.form-error');error.textContent='';
 try{
  if(form.id==='intakeInput'){
   const pending=await draftRead(context.pendingKey);
   if(!context.active())return;
   if(pending){intakeDraft=pending;render();return;}
   const files=[...form.elements.files.files],images=[],photos=[];let text=form.elements.text.value.trim();
   if(files.length>3)throw Error('Adjuntá hasta 3 fotos o una lista.');
   for(const file of files){
    if(file.size>12000000)throw Error('El archivo supera 12 MB. Dividilo en fotos más pequeñas.');
    if(/\.(txt|csv)$/i.test(file.name)){text+='\n'+await file.text();continue;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Usá fotos JPG, PNG o WebP, o listas TXT/CSV. Podés pegar celdas de una planilla.');
    images.push(await photo(file));
   }
   if(!text.trim()&&!images.length)throw Error('Adjuntá una foto o pegá una lista.');
   if(!context.active())return;
   const progress=form.querySelector('#intakeProgress');
   if(progress)progress.textContent='Preparando lectura…';
   let result=await intakeFetch('scan',{text,images},context.boat);
   if(!context.active())return;
   if(result.needsOcr){
    let recognized='';
    try { recognized=(await intakeOcr(images,progress)).trim(); }
    catch { /* A legible attachment can still be reviewed by the operator. */ }
    if(!context.active())return;
    if(recognized){
     text=[text,recognized].filter(Boolean).join('\n');
     result=await intakeFetch('scan',{text,images:[]},context.boat);
    } else {
     result.notice='La lectura automática no pudo extraer texto. Revisá la foto adjunta y completá los datos que puedas verificar.';
    }
   }
   for(const image of images){
    if(!context.active())return;
    photos.push((await api('photos','POST',{boat:context.boat,data:image})).url);
   }
   if(!context.active())return;
   intakeDraft={kind:form.elements.kind.value,source:{text,photos},data:result.data,reviewRevision:revision,notice:result.notice||'Lectura preparada. Confirmá los datos contra el original.'};
   await intakeRemember(context,intakeDraft);if(context.active())render();
  }else{
   const data=intakeRead(form);clearTimeout(intakeRememberTimer);
   const doc=intakeDraft;
   const operation=doc.id?'apply':doc.kind==='purchase'?'ticket_confirm':'submit';
   if(!doc.pending)await intakeRemember(context,doc);
   const pending=doc.pending||{operation,payload:{kind:doc.kind,data:structuredClone(data),key:uid(),
    ...(doc.id?{id:doc.id}:{source:doc.source}),
    ...(operation!=='submit'?{revision:doc.reviewRevision??revision,confirmed:true}:{})}};
   doc.pending=pending;
   if(!context.active())return;
   if(!await intakeClaim(context,doc)){
    const existing=await draftRead(context.pendingKey);
    if(context.active()){intakeDraft=existing||doc;if(!existing)delete doc.pending;render();}
    return;
   }
   if(!context.active())return;
   form.querySelector('fieldset').disabled=true;
   let result;
   try{result=await intakeFetch(pending.operation,pending.payload,context.boat);}
   catch(e){
    if([400,404,409,413,415,422].includes(e.status)){
     await intakeRelease(context,doc,false);delete doc.pending;
     if(context.active()){
      form.querySelector('fieldset').disabled=false;
      if(e.status===409){
       await opsAfterSave();
       if(context.active()){
        doc.reviewRevision=revision;doc.notice='El stock cambió. Revisá las cantidades actuales y volvé a confirmar la carga.';
        await intakeRemember(context,doc);if(context.active())render();
       }
      }
     }
    }
    throw e;
   }
   await intakeRelease(context,doc,true);
   if(!context.active())return;
   toast(result.status==='applied'?(result.alreadyApplied?'Ese ticket ya estaba cargado. No se duplicó.':'Carga confirmada.'):'Carga guardada para revisión de administración.');
   intakeDraft=null;intakeDocs=null;intakeRestore=null;await opsAfterSave();if(context.active())await intakeReload();
  }
 }catch(e){if(context.active()){error.textContent=e.message;if(intakeDraft?.pending){form.querySelector('fieldset')?.setAttribute('disabled','');button.textContent='Verificar guardado pendiente';}}}
 finally{intakeBusy=false;button.disabled=false;}
});
document.addEventListener('change',event=>{
 const row=event.target.closest('[data-intake-row]');
 if(row&&event.target.name==='productId'){
  const p=state.products.find(p=>p.id===event.target.value);if(p)for(const [key,value] of Object.entries({name:p.name,unit:p.unit,area:p.area||'tecnica',location:p.location})){const field=row.querySelector('[name="'+key+'"]');if(field)field.value=value;}
  intakeRead(row.closest('form'));intakeRemember();
 }
 if(event.target.id==='intakeBulkArea'&&intakeDraft?.kind==='request'){for(const el of document.querySelectorAll('[data-intake-row] [name="area"]'))if(!el.value)el.value=event.target.value;intakeRead($('#intakeReview'));intakeRemember();}
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-intake]');if(!button||intakeBusy||!session?.admin)return;
 const context=intakeContext();
 try{
  const action=button.dataset.intake,form=$('#intakeReview');
  if(action==='ticket' || action==='expense') dayIntakeParent=action==='ticket'?'ops-stock':'ops-cash';
  if(['ticket','expense','open','back','reject'].includes(action)){
   const pending=await draftRead(context.pendingKey);
   if(!context.active())return;
   if(pending){intakeBoat=context.draftKey;intakeDraft=pending;dayPage='ops-intake';navigate('day');return;}
  }
  if(action==='ticket' || action==='expense'){intakeStartKind=action==='ticket'?'purchase':'expense';intakeDraft=null;dayPage='ops-intake';navigate('day');return;}
  if(action==='open'){intakeDraft=structuredClone(intakeDocs.find(d=>d.id===button.dataset.id));intakeDraft.reviewRevision=revision;render();}
  if(action==='restore'){intakeDraft=intakeRestore;render();}
  if(action==='back'){if(form)intakeRead(form);await intakeRemember(context,intakeDraft);const saved=await draftRead(context.draftKey);if(context.active()){intakeDraft=null;intakeRestore=saved;render();}}
  if(action==='bulk'){for(const el of document.querySelectorAll('[data-intake-row]')){for(const [name,id] of [['area','intakeBulkArea'],['location','intakeBulkLocation']]){const field=el.querySelector('[name="'+name+'"]');if(field&&!field.value)field.value=$('#'+id)?.value||'';}}intakeRead(form);await intakeRemember();}
  if(action==='add'||action==='remove'){intakeRead(form);if(action==='add')intakeDraft.data.items.push({name:'',quantity:null,unit:'',area:'',location:'',unitCost:null,productId:''});else intakeDraft.data.items.splice(Number(button.dataset.index),1);await intakeRemember();render();}
  if(action==='reject'){if(!confirm('¿Descartar esta carga sin cambiar stock ni gastos?'))return;await intakeFetch('reject',{id:intakeDraft.id,key:uid()},context.boat);if(context.active()){intakeDraft=null;intakeDocs=null;await intakeReload();}}
 }catch(e){toast(e.message);}
});
document.addEventListener('input',event=>{const form=event.target.closest('.ops-form');if(form)form.dataset.dirty='true';});
setInterval(async()=>{if(document.hidden||view!=='day'||!['ops-stock','ops-requests','ops-expenses','ops-intake'].includes(dayPage)||opsBusy||opsLoading||intakeBusy||intakeLoading||intakeDraft||document.querySelector('.ops-form[data-dirty="true"]')||$('#intakeInput')||$('#expenseForm')||expenseBusy||expenseLoading)return;try{await opsAfterSave();if(dayPage==='ops-intake')await intakeReload();if(dayPage==='ops-expenses')await expenseReload();}catch{ /* Keep current view available until the connection returns. */ }},60000);
