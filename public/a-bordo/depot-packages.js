"use strict";
const packageReceiptIsValid=(pending,receipt)=>{
  const expected={send:"in_transit",receive:"received",issue:"review"}[pending?.op];
  if(!expected || receipt?.ok!==true || receipt.status!==expected)return false;
  return pending.op==="send" ? typeof receipt.id==="string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(receipt.id) : !!pending.payload.id && receipt.id===pending.payload.id;
};
class StockroomPackages extends HTMLElement {
  connectedCallback(){
    if(!session || (!session.admin&&!['capitan','chef','marinero','encargado'].includes(role)))return;
    this.user=session.id; this.parent=this.closest("boat-admin-stock");
    this.boat=this.hasAttribute("data-admin-depot")?this.parent?.data?.scope:boatId;
    if(!this.boat||this.boat==="depot")return;
    this.admin=!!session.admin; this.depot=this.parent?.data;
    this.key="depot-package:"+this.user+":"+this.boat;
    this.sendRows=1;
    void this.read();
  }
  alive(){return this.isConnected&&session?.id===this.user&&
    (this.depot?adminStockSelection?.scope===this.boat:boatId===this.boat);}
  async fetch(op,payload){
    const url="/api/boat-ops/warehouse_package_"+op+(payload?"":"?boat="+encodeURIComponent(this.boat));
    const res=await fetch(url,payload?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}:{cache:"no-store"});
    const out=await res.json().catch(()=>({}));
    if(!res.ok)throw Object.assign(Error(out.error||"No se pudo consultar el paquete."),{status:res.status});
    return out;
  }
  async read(){
    if(!this.alive())return;
    this.innerHTML='<h2>Paquetes de Tierra</h2><p role="status">Buscando paquetes…</p>';
    const [packages,pending]=await Promise.allSettled([this.fetch("list"),draftRead(this.key)]);
    if(!this.alive())return;
    this.pending=pending.status==="fulfilled"?pending.value:null;
    this.draftUnavailable=pending.status!=="fulfilled";
    this.listUnavailable=packages.status!=="fulfilled"||!Array.isArray(packages.value);
    this.packages=this.listUnavailable?[]:packages.value;
    this.draw();
  }
  url(id){return "/api/boat/photos?boat="+encodeURIComponent(this.boat)+"&id="+encodeURIComponent(id);}
  photoLabel(label){return '<label>'+label+'<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment" required></label>';}
  sendLine(){
    const options=this.depot.depotProducts.filter(p=>p.current>0).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name+' · '+p.current+' '+p.unit+' · '+p.location)+'</option>').join("");
    return '<div data-line class="day-inventory"><label>Producto<select name="productId" required><option value="">Elegí un insumo de Tierra</option>'+options+'</select></label>'+
      '<label>Fundas, cajas o grupos<input type="number" name="packs" min="1" max="1000000" step="1" required value="1"></label>'+
      '<label>Cantidad por funda (en la unidad del inventario)<input type="number" name="perPack" min="0.0001" step="0.0001" required></label><p data-pack-total></p></div>';
  }
  shipCard(pkg){
    const statuses={in_transit:"En camino",review:"Diferencia por revisar",received:"Recibido y firmado"};
    const lines=pkg.items.map(l=>'<li>'+esc(l.name)+': '+esc(l.packs+' × '+l.perPack+' = '+l.sent+' '+l.unit)+'</li>').join("");
    const receipts=pkg.receipts.map(r=>'<li><a target="_blank" rel="noopener" href="'+esc(this.url(r.photo))+'">Foto de recepción</a>'+
      (r.verified?' · Firmó '+esc(r.signedBy||"tripulación")+' · '+esc(date(r.at))+' · <a target="_blank" rel="noopener" href="'+esc(this.url(r.signature))+'">Ver firma</a>':' · Diferencia: '+esc(r.note))+'</li>').join("");
    return '<article class="day-inventory"><h3>'+esc(statuses[pkg.status]||pkg.status)+'</h3><p>'+esc(date(pkg.sent_at))+' · Tierra → '+esc(this.depot?.boats?.find(b=>b.id===this.boat)?.name || state.boat.name)+'</p><ul>'+lines+
      '</ul><figure><a target="_blank" rel="noopener" href="'+esc(this.url(pkg.sent_photo))+'"><img loading="lazy" class="day-reference" style="max-height:200px;object-fit:contain" alt="Foto del despacho" src="'+esc(this.url(pkg.sent_photo))+'"></a><figcaption>Foto de salida de Tierra</figcaption></figure>'+(receipts?'<ul>'+receipts+'</ul>':'')+
      (!this.pending&&!this.draftUnavailable&&pkg.status!=="received"?'<details class="day-disclosure"><summary>Recibir paquete</summary><p>Compará la foto y el listado de salida con el paquete que llegó. No hay que cargar los productos otra vez.</p>'+
       '<form data-package-receive="'+esc(pkg.id)+'">'+this.photoLabel('Sacar o elegir foto del paquete recibido')+
       '<figure data-arrival-preview hidden><img class="day-reference" style="max-height:200px;object-fit:contain" alt="Vista de la foto de llegada"><figcaption>Foto de llegada</figcaption></figure>'+
       '<label class="check"><input type="checkbox" name="verified" required>Verifiqué las fotos y el paquete coincide con el envío completo.</label>'+
       '<label>Firmá con el dedo<canvas width="360" height="120" data-signature aria-label="Dibujá tu firma" style="display:block;max-width:100%;width:100%;border:1px solid #718198;background:#fff;touch-action:none"></canvas></label>'+
       '<button class="day-secondary" type="button" data-clear-signature>Borrar firma</button><button class="day-primary" type="submit">Firmar y recibir todo</button>'+
       '<details><summary>No coincide con el envío</summary><label>Qué no coincide<textarea name="note" maxlength="300"></textarea></label><button type="button" class="day-secondary" data-package-issue>Avisar diferencia sin recibir</button></details></form></details>':'')+'</article>';
  }
  setupSignature(form){
    const canvas=form.querySelector("[data-signature]"),ctx=canvas.getContext("2d");
    ctx.strokeStyle="#12263a";ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";
    let pointer=null,old;
    const pos=e=>{const b=canvas.getBoundingClientRect();return [(e.clientX-b.left)*canvas.width/b.width,(e.clientY-b.top)*canvas.height/b.height];};
    canvas.onpointerdown=e=>{if(pointer!==null)return;pointer=e.pointerId;old=pos(e);canvas.setPointerCapture(pointer);};
    canvas.onpointermove=e=>{
      if(pointer!==e.pointerId)return;
      const next=pos(e);if(Math.hypot(next[0]-old[0],next[1]-old[1])<1)return;
      ctx.beginPath();ctx.moveTo(...old);ctx.lineTo(...next);ctx.stroke();old=next;canvas.dataset.signed="true";
    };
    canvas.onpointerup=canvas.onpointercancel=()=>{pointer=null;};
    form.querySelector("[data-clear-signature]").onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);delete canvas.dataset.signed;};
    return canvas;
  }
  draw(){
    const maySend=!this.listUnavailable&&!this.draftUnavailable&&this.admin&&this.depot?.depotProducts?.some(p=>p.current>0);
    this.innerHTML='<section><h2>Paquetes de Tierra</h2><p role="alert" data-feedback>'+esc(this.message||"")+'</p>'+
      (this.pending?'<p>Hay un guardado pendiente. Verificalo antes de registrar otro paquete.</p><button data-verify-package type="button" class="day-primary">Verificar guardado pendiente</button>':
      this.draftUnavailable?'<p>No se pudo comprobar el guardado anterior. Actualizá antes de seguir.</p>':maySend?'<details class="day-disclosure"><summary>Preparar paquete desde Tierra</summary><p>El stock de Tierra baja cuando confirmás el despacho. El barco suma la cantidad recién cuando confirma la recepción.</p>'+
      '<form data-package-send><div data-send-lines>'+this.sendLine()+'</div><button type="button" class="day-secondary" data-add-line>Agregar producto</button>'+
      this.photoLabel('Foto del paquete antes de despachar')+'<button class="day-primary" type="submit">Confirmar despacho</button></form></details>':
      this.depot&&!this.listUnavailable?'<p>No hay existencias en Tierra para despachar.</p>':'')+
      (this.listUnavailable?'<p>No se pudo consultar la lista de paquetes.</p>':this.packages.length?this.packages.map(p=>this.shipCard(p)).join(""):'<p>No hay paquetes de Tierra para este barco.</p>')+
      (this.draftUnavailable||this.listUnavailable?'<button type="button" class="day-secondary" data-reload-packages>Actualizar paquetes</button>':'')+'</section>';
    const send=this.querySelector("[data-package-send]");
    if(send){
      send.querySelector("[data-add-line]").onclick=()=>{if(this.sendRows<50){this.sendRows++;send.querySelector("[data-send-lines]").insertAdjacentHTML("beforeend",this.sendLine());}};
      send.oninput=e=>{const row=e.target.closest("[data-line]");if(!row)return;const selected=this.depot.depotProducts.find(p=>p.id===row.querySelector('[name=productId]').value);
        const n=Number(row.querySelector('[name=packs]').value)*Number(row.querySelector('[name=perPack]').value);
        row.querySelector('[data-pack-total]').textContent=selected?'Total a despachar: '+Number(n.toFixed(4))+' '+selected.unit:'';};
      send.onsubmit=e=>{e.preventDefault();const items=[...send.querySelectorAll("[data-line]")].map(row=>({
        productId:row.querySelector('[name=productId]').value,packs:Number(row.querySelector('[name=packs]').value),perPack:Number(row.querySelector('[name=perPack]').value)
      }));void this.save("send",send,{items,revision:this.depot.depotRevision});};
    }
    for(const form of this.querySelectorAll("[data-package-receive]")){
      const canvas=this.setupSignature(form);
      form.elements.photo.onchange=()=>{
        const preview=form.querySelector("[data-arrival-preview]"), image=preview.querySelector("img");
        if(image.src)URL.revokeObjectURL(image.src);
        const file=form.elements.photo.files[0];preview.hidden=!file;
        if(file){image.src=URL.createObjectURL(file);this.previewURLs??=new Set();this.previewURLs.add(image.src);}else image.removeAttribute("src");
        form.elements.verified.checked=false;
      };
      form.onsubmit=e=>{e.preventDefault();
        void this.save("receive",form,{id:form.dataset.packageReceive,verified:form.elements.verified.checked},
          canvas.dataset.signed==='true'?canvas.toDataURL("image/png"):null);
      };
      form.querySelector("[data-package-issue]").onclick=()=>this.save("issue",form,{id:form.dataset.packageReceive,note:form.elements.note.value.trim()});
    }
    const reload=this.querySelector("[data-reload-packages]");if(reload)reload.onclick=()=>this.read();
    const verify=this.querySelector("[data-verify-package]");if(verify)verify.onclick=()=>this.save();
  }
  disconnectedCallback(){for(const src of this.previewURLs||[])URL.revokeObjectURL(src);}
  async save(op,form,data,signatureData){
    if(!this.alive()||this.busy||this.draftUnavailable)return;
    const button=form?.querySelector('[type=submit]')||this.querySelector("[data-verify-package]");
    this.busy=true;if(button)button.disabled=true;
    const feedback=this.querySelector("[data-feedback]");feedback.textContent="";
    const verification=!!this.pending;
    try {
      let pending=this.pending;
      if(!pending){
        if(op==="send"&&!data.items.length)throw Error("Elegí qué productos vas a despachar.");
        if(op==="receive"&&(!data.verified||!signatureData))throw Error("Compará las fotos y firmá antes de recibir.");
        if(op==="issue"&&data.note.length<3)throw Error("Indicá brevemente qué no coincide.");
        const file=form.elements.photo.files[0];
        if(!file)throw Error("Adjuntá la foto del paquete.");
        const upload=async image=>{
          try {
            const saved=await api('photos','POST',{boat:this.boat,data:image});
            const id=new URL(saved.url,location.origin).searchParams.get('id');
            if(!id||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw Error("Foto sin comprobante.");
            return id;
          }catch{throw Error("No se confirmó la foto o la firma. Todavía no se registró movimiento de stock. Intentá de nuevo.");}
        };
        const image=await photo(file);
        if(!this.alive())return;
        const photoId=await upload(image);
        if(!this.alive())return;
        let signature;
        if(op==="receive"){
          signature=await upload(signatureData);
          if(!this.alive())return;
        }
        pending={op,payload:{boat:this.boat,key:uid(),photo:photoId,...data,...(signature?{signature}:{})}};
        const claimed=await editStoredDraft(this.key,old=>old||pending);
        this.pending=claimed;
        if(claimed.payload.key!==pending.payload.key){this.message="Verificá primero el guardado anterior.";this.draw();return;}
      }
      if(!this.alive())return;
      const receipt=await this.fetch(pending.op,pending.payload);
      if(!packageReceiptIsValid(pending,receipt))throw Error("No se pudo confirmar el guardado. Verificalo antes de registrar otro paquete.");
      await editStoredDraft(this.key,old=>old?.payload.key===pending.payload.key?null:old);
      this.pending=null;
      if(!this.alive())return;
      toast(pending.op==="send"?"Paquete despachado. Aviso registrado.":pending.op==="issue"?"Diferencia informada. No cambió el stock.":"Paquete completo recibido y firmado.");
      if(this.parent)await this.parent.read();else await opsAfterSave();
    }catch(err){
      this.message=err.message;
      if(this.pending&&!verification&&[400,409,403].includes(err.status)){
        const key=this.pending.payload.key;
        try{await editStoredDraft(this.key,old=>old?.payload.key===key?null:old);this.pending=null;}catch{}
        if(err.status===409&&this.alive()){
          if(this.parent)await this.parent.read();else await this.read();
        }
      }
      if(this.alive()){
        if(this.pending)this.draw();
        else {const current=this.querySelector('[data-feedback]');if(current)current.textContent=this.message;}
      }
    }finally{this.busy=false;if(button)button.disabled=false;}
  }
}
customElements.define("stockroom-packages",StockroomPackages);
