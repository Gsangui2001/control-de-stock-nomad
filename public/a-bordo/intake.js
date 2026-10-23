"use strict";
let intakeDocs=null,intakeLoading=false,intakeBusy=false,intakeError='',intakeDraft=null,intakeBoat='',intakeRestore=null;
const intakeNames={count:'Conteo de existencias',purchase:'Compra ya recibida',expense:'Gasto sin entrada de stock',request:'Lista de faltantes'};
const intakeStatuses={pending:'Pendiente de revisión',applied:'Confirmada',rejected:'Descartada'};
async function intakeFetch(op,payload){
 const response=await fetch('/api/boat-intake/'+op+(payload?'':'?boat='+encodeURIComponent(boatId)),{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify({...payload,boat:boatId}):undefined});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'No se pudo confirmar la carga'),{status:response.status});return result;
}
async function intakeReload(){
 const boat=boatId;intakeLoading=true;
 try{const docs=await intakeFetch('list');if(boat!==boatId)return;intakeDocs=docs;intakeError='';intakeRestore=await draftRead('intake:'+session.id+':'+boatId);}
 catch(e){intakeError=e.message;}finally{if(boat===boatId){intakeLoading=false;if(dayPage==='ops-intake')render();}}
}
function intakeInput(label,name,value='',type='text',attrs=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;}
function intakeView(){
 if(intakeBoat!==boatId){intakeBoat=boatId;intakeDocs=null;intakeDraft=null;intakeRestore=null;intakeError='';}
 if(!intakeDocs&&!intakeLoading&&!intakeError)intakeReload();
 if(intakeDraft)return intakeReviewView();
 return `<h1>Cargar foto o lista</h1><p>Elegí qué representa el documento. La lectura prepara las filas para revisar; las cantidades cambian al confirmar la carga.</p>${intakeError?`<p class="form-error" role="alert">${esc(intakeError)}</p>`:''}${intakeRestore?'<div class="day-note">Hay una preparación guardada en este dispositivo. <button data-intake="restore">Recuperarla</button></div>':''}${writable()?`<form id="intakeInput"><label>¿Qué vas a cargar?<select name="kind" required><option value="">Elegí una opción</option>${Object.entries(intakeNames).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><p class="day-muted">Conteo reemplaza la cantidad de las filas incluidas. Compra recibida suma existencias y registra el gasto. Si la mercadería ya fue cargada por recepción de un pedido, elegí Gasto sin entrada de stock.</p><label>Adjuntar fotos o una lista<input name="files" type="file" accept="image/jpeg,image/png,image/webp,.txt,.csv" multiple><small>Hasta 3 fotos claras, o un archivo TXT/CSV. Para una planilla, copiá las celdas y pegalas abajo.</small></label><label>Lista o texto del comprobante<textarea name="text" maxlength="30000" placeholder="Producto; cantidad; unidad; ubicación; precio unitario (opcional)"></textarea></label><p class="day-muted">También podés escribir una línea por producto, por ejemplo: cantidad + unidad + producto. No uses cantidades de ejemplo como stock real.</p><p class="form-error" role="alert"></p><button class="day-primary" type="submit">Leer y preparar carga</button><p id="intakeProgress" role="status"></p></form>`:''}<h2>Cargas compartidas del barco</h2>${intakeLoading?'<p>Cargando…</p>':(intakeDocs||[]).map(doc=>`<article class="day-inventory"><h3>${esc(intakeNames[doc.kind])}</h3><p>${esc(intakeStatuses[doc.status])} · ${esc(doc.author)} · ${date(doc.created_at)}</p><p>${doc.data.items.length} filas${doc.data.supplier?' · '+esc(doc.data.supplier):''}</p><button class="day-secondary" data-intake="open" data-id="${doc.id}">Ver y revisar</button></article>`).join('')||empty('No hay fotos o listas cargadas todavía.')}`;
}
function intakeReviewView(){
 const doc=intakeDraft,data=doc.data,canEdit=!doc.id||(doc.status==='pending'&&(dayManager()||(doc.kind==='request'&&doc.created_by===session.id)));
 const money=['purchase','expense'].includes(doc.kind);
 return `<button class="day-back" data-intake="back">← Fotos y listas</button><h1>${esc(intakeNames[doc.kind])}</h1><p>${doc.id?esc(intakeStatuses[doc.status]):'Revisá lo leído antes de enviarlo.'}</p>${doc.notice?`<p class="day-note">${esc(doc.notice)}</p>`:''}${doc.source.photos.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener"><img class="day-reference" src="${esc(url)}" alt="Comprobante o lista adjunta"></a>`).join('')}<details class="day-disclosure"><summary>Ver texto de origen</summary><div class="manual-content">${esc(doc.source.text)}</div></details><form id="intakeReview"><fieldset ${canEdit?'':'disabled'} style="border:0;padding:0;min-width:0">${intakeInput('Fecha del conteo, compra o lista','date',data.date,'date',`required max="${today()}"`)}${money?intakeInput('Proveedor','supplier',data.supplier,'text','required maxlength="140"')+intakeInput('Número de comprobante (si tiene)','reference',data.reference,'text','maxlength="140"')+`<label>Moneda<select name="currency" required><option value="">Confirmá la moneda</option>${['USD','EUR','ARS','PAB'].map(c=>`<option ${c===data.currency?'selected':''}>${c}</option>`).join('')}</select></label>`+intakeInput('Total del comprobante','total',data.total,'number','required min="0" max="1000000000" step="0.01"'):''}${doc.kind!=='expense'?`<label>Completar área en las filas vacías<select id="intakeBulkArea"><option value="">Elegí el área</option><option value="gastronomia">Cocina y bebidas</option><option value="tecnica">Limpieza, repuestos y otros insumos</option></select></label>${doc.kind!=='request'?'<label>Completar ubicación en las filas vacías<input id="intakeBulkLocation" placeholder="Ubicación real"></label><button type="button" class="day-secondary" data-intake="bulk">Completar filas vacías</button>':''}<div id="intakeRows">${data.items.map((row,i)=>`<article class="day-inventory" data-intake-row="${i}"><h3>Producto ${i+1}</h3><label>Vincular con un insumo existente<select name="productId"><option value="">Detectar coincidencia exacta o crear nuevo</option>${state.products.map(p=>`<option value="${esc(p.id)}" ${p.id===row.productId?'selected':''}>${esc(p.name)} · ${esc(p.unit)} · ${esc(p.location)}</option>`).join('')}</select></label>${intakeInput('Producto','name',row.name,'text','required maxlength="140"')}${intakeInput(doc.kind==='count'?'Cantidad contada':'Cantidad','quantity',row.quantity,'number',`required min="${doc.kind==='count'?'0':'0.0001'}" max="1000000000" step="0.0001"`)}${intakeInput('Unidad','unit',row.unit,'text','required maxlength="20"')}<label>Área<select name="area" required><option value="">Confirmá el área</option><option value="gastronomia" ${row.area==='gastronomia'?'selected':''}>Cocina y bebidas</option><option value="tecnica" ${row.area==='tecnica'?'selected':''}>Limpieza, repuestos y otros insumos</option></select></label>${doc.kind!=='request'?intakeInput('Ubicación','location',row.location,'text','required maxlength="140"'):''}${doc.kind==='purchase'?intakeInput('Precio por unidad (vacío si no se conoce)','unitCost',row.unitCost,'number','min="0" max="1000000000" step="0.0001"'):''}<button type="button" class="day-text" data-intake="remove" data-index="${i}">Quitar esta fila</button></article>`).join('')}</div><button type="button" class="day-secondary" data-intake="add">＋ Agregar fila</button>`:''}<label>Observaciones y dudas<textarea name="notes" maxlength="3000">${esc(data.notes)}</textarea></label></fieldset><p class="form-error" role="alert"></p>${canEdit?`<label class="check"><input name="confirmed" type="checkbox" required>${doc.kind==='purchase'?'Revisé cantidades, unidades, precios y moneda. La mercadería fue recibida y todavía no se cargó al stock.':doc.kind==='count'?'Revisé el conteo real. Reemplazará las existencias de las filas incluidas.':doc.kind==='expense'?'Revisé proveedor, fecha, moneda e importe. Este gasto no debe sumar stock.':'Revisé los productos, cantidades y unidades solicitados.'}</label><button class="day-primary" type="submit">${doc.id?(doc.kind==='request'?'Crear faltantes':'Confirmar y actualizar'):'Enviar carga revisada'}</button>`:''}${doc.id&&doc.status==='pending'&&dayManager()?'<button type="button" class="day-text" data-intake="reject">Descartar carga</button>':''}</form>${!doc.id?'<p class="day-muted">La carga quedará compartida para revisión. Administración confirma existencias y gastos; el autor puede incorporar su lista a Pedidos.</p>':''}`;
}
function intakeRead(form){
 const data={...intakeDraft.data};for(const key of ['date','supplier','reference','currency','notes'])if(form.elements.namedItem(key)&&!['name'].includes(key))data[key]=form.elements.namedItem(key).value.trim();
 if(form.elements.total)data.total=form.elements.total.value===''?null:Number(form.elements.total.value);
 if(intakeDraft.kind!=='expense')data.items=[...form.querySelectorAll('[data-intake-row]')].map(el=>{const get=n=>el.querySelector('[name="'+n+'"]')?.value.trim()||'';return {name:get('name'),quantity:get('quantity')===''?null:Number(get('quantity')),unit:get('unit'),location:get('location'),area:get('area'),productId:get('productId'),unitCost:get('unitCost')===''?null:Number(get('unitCost'))};});
 intakeDraft.data=data;return data;
}
async function intakeRemember(){if(intakeDraft&&!intakeDraft.id)await draftWrite('intake:'+session.id+':'+boatId,intakeDraft);}
let intakeRememberTimer;
document.addEventListener('input',e=>{if(e.target.closest('#intakeReview')){intakeRead(e.target.closest('form'));clearTimeout(intakeRememberTimer);intakeRememberTimer=setTimeout(()=>intakeRemember().catch(()=>{}),300);}});
async function intakeOcr(images){
 if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/a-bordo/ocr/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar el lector de fotos. Revisá la conexión.'));document.head.append(script);});
 const worker=await Tesseract.createWorker(['spa','eng'],1,{workerPath:'/a-bordo/ocr/worker.min.js',corePath:'/a-bordo/ocr',langPath:'/a-bordo/ocr',logger:m=>{if($('#intakeProgress'))$('#intakeProgress').textContent='Leyendo foto… '+Math.round((m.progress||0)*100)+'%';}});
 try{const text=[];for(const image of images)text.push((await worker.recognize(image)).data.text);return text.join('\n');}finally{await worker.terminate();}
}
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['intakeInput','intakeReview'].includes(form.id))return;event.preventDefault();if(intakeBusy||!form.reportValidity())return;
 intakeBusy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;const error=form.querySelector('.form-error');error.textContent='';
 try{
  if(form.id==='intakeInput'){
   const files=[...form.elements.files.files],images=[],photos=[];let text=form.elements.text.value.trim();
   if(files.length>3)throw Error('Adjuntá hasta 3 fotos o una lista.');
   for(const file of files){
    if(file.size>12000000)throw Error('El archivo supera 12 MB. Dividilo en fotos más pequeñas.');
    if(/\.(txt|csv)$/i.test(file.name)){text+='\n'+await file.text();continue;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Usá fotos JPG, PNG o WebP, o listas TXT/CSV. Podés pegar celdas de una planilla.');
    images.push(await photo(file));
   }
   if(!text.trim()&&!images.length)throw Error('Adjuntá una foto o pegá una lista.');
   $('#intakeProgress').textContent='Preparando lectura…';let result=await intakeFetch('scan',{text,images});
   if(result.needsOcr){const recognized=await intakeOcr(images);text=[text,recognized].filter(Boolean).join('\n');result=await intakeFetch('scan',{text,images:[]});}
   for(const image of images)photos.push((await api('photos','POST',{boat:boatId,data:image})).url);
   intakeDraft={kind:form.elements.kind.value,source:{text,photos},data:result.data,notice:result.notice||'Lectura preparada. Confirmá los datos contra el original.'};
   await intakeRemember();render();
  }else{
   const data=intakeRead(form);clearTimeout(intakeRememberTimer);
   const serialized=JSON.stringify(data);if(form.dataset.payload!==serialized){form.dataset.key=uid();form.dataset.payload=serialized;}
   if(intakeDraft.id)await intakeFetch('apply',{id:intakeDraft.id,kind:intakeDraft.kind,data,revision,confirmed:true,key:form.dataset.key});
   else{
    const result=await intakeFetch('submit',{kind:intakeDraft.kind,source:intakeDraft.source,data,key:form.dataset.key});
    if(result.status==='applied')toast('Ese documento ya fue confirmado. No se duplicó.');
    else toast('Carga guardada para revisión.');
    await draftWrite('intake:'+session.id+':'+boatId,null);
   }
   intakeDraft=null;intakeDocs=null;intakeRestore=null;await opsAfterSave();await intakeReload();
  }
 }catch(e){error.textContent=e.message;}
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
 const button=event.target.closest('[data-intake]');if(!button||intakeBusy)return;
 try{
  const action=button.dataset.intake,form=$('#intakeReview');
  if(action==='open'){intakeDraft=structuredClone(intakeDocs.find(d=>d.id===button.dataset.id));render();}
  if(action==='restore'){intakeDraft=intakeRestore;render();}
  if(action==='back'){if(form)intakeRead(form);await intakeRemember();intakeDraft=null;intakeRestore=await draftRead('intake:'+session.id+':'+boatId);render();}
  if(action==='bulk'){for(const el of document.querySelectorAll('[data-intake-row]')){for(const [name,id] of [['area','intakeBulkArea'],['location','intakeBulkLocation']]){const field=el.querySelector('[name="'+name+'"]');if(field&&!field.value)field.value=$('#'+id)?.value||'';}}intakeRead(form);await intakeRemember();}
  if(action==='add'||action==='remove'){intakeRead(form);if(action==='add')intakeDraft.data.items.push({name:'',quantity:null,unit:'',area:'',location:'',unitCost:null,productId:''});else intakeDraft.data.items.splice(Number(button.dataset.index),1);await intakeRemember();render();}
  if(action==='reject'){if(!confirm('¿Descartar esta carga sin cambiar stock ni gastos?'))return;await intakeFetch('reject',{id:intakeDraft.id,key:uid()});intakeDraft=null;intakeDocs=null;await intakeReload();}
 }catch(e){toast(e.message);}
});
document.addEventListener('input',event=>{const form=event.target.closest('.ops-form');if(form)form.dataset.dirty='true';});
setInterval(async()=>{if(document.hidden||view!=='day'||!['ops-stock','ops-requests','ops-expenses','ops-intake'].includes(dayPage)||opsBusy||opsLoading||intakeBusy||intakeLoading||intakeDraft||document.querySelector('.ops-form[data-dirty="true"]')||$('#intakeInput')||$('#expenseForm')||expenseBusy||expenseLoading)return;try{await opsAfterSave();if(dayPage==='ops-intake')await intakeReload();if(dayPage==='ops-expenses')await expenseReload();}catch{ /* Keep current view available until the connection returns. */ }},60000);
