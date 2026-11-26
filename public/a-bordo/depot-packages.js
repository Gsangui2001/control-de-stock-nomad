"use strict";
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
    try {
      const [packages,pending]=await Promise.all([this.fetch("list"),draftRead(this.key)]);
      if(this.alive()){this.packages=packages;this.pending=pending;this.draw();}
    } catch(e){
      if(this.alive())this.innerHTML='<h2>Paquetes de Tierra</h2><p role="alert">'+esc(e.message)+'</p>';
    }
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
    const statuses={in_transit:"En camino",partial:"Recibido en parte",received:"Recibido completo"};
    const lines=pkg.items.map(l=>'<li>'+esc(l.name)+': '+esc(l.packs+' × '+l.perPack+' = '+l.sent+' '+l.unit)+
      ' · recibido: '+esc(l.received)+'</li>').join("");
    const receipts=pkg.receipts.map(r=>'<li><a target="_blank" rel="noopener" href="'+esc(this.url(r.photo))+'">Foto de recepción</a> · '+esc(r.items.map(l=>l.name+' '+l.quantity+' '+l.unit).join(' · '))+(r.note?' · '+esc(r.note):'')+'</li>').join("");
    const rows=pkg.items.filter(l=>l.sent>l.received).map(l=>{
      const remaining=Number((l.sent-l.received).toFixed(4));
      const matches=state.products.filter(p=>boatId===this.boat &&
        depotNameKey(p.name)===depotNameKey(l.name) && depotNameKey(p.unit)===depotNameKey(l.unit) && (p.area||'tecnica')===l.area);
      const targetLocation=matches.length===1?matches[0].location:"";
      return '<div data-receive-line="'+esc(l.id)+'" class="day-inventory"><strong>'+esc(l.name+' · faltan '+remaining+' '+l.unit)+'</strong>'+
        '<label>Cantidad que llegó<input type="number" name="quantity" required min="0" max="'+remaining+'" step="0.0001" value="'+remaining+'"></label>'+
        (matches.length?'<label>Ubicación de stock<select name="targetProductId"><option value="">Usar otra ubicación</option>'+
          matches.map(p=>'<option value="'+esc(p.id)+'" data-location="'+esc(p.location)+'" '+(matches.length===1?'selected':'')+'>'+esc(p.location)+'</option>').join("")+'</select></label>':'')+
        '<label>Lugar de guardado<input name="location" maxlength="140" value="'+esc(targetLocation)+'" placeholder="Ej.: heladera de popa"></label></div>';
    }).join("");
    return '<article class="day-inventory"><h3>'+esc(statuses[pkg.status]||pkg.status)+'</h3><p>'+esc(date(pkg.sent_at))+' · Tierra → '+esc(this.depot?.boats?.find(b=>b.id===this.boat)?.name || state.boat.name)+'</p><ul>'+lines+
      '</ul><p><a target="_blank" rel="noopener" href="'+esc(this.url(pkg.sent_photo))+'">Foto del despacho</a></p>'+(receipts?'<ul>'+receipts+'</ul>':'')+
      (!this.pending&&pkg.status!=="received"?'<details class="day-disclosure"><summary>Recibir paquete</summary><p>Compará con la foto de despacho. Si un producto no llegó, indicá 0; queda pendiente.</p>'+
       '<form data-package-receive="'+esc(pkg.id)+'">'+rows+this.photoLabel('Foto de lo recibido')+
       '<label>Observación (opcional)<input name="note" maxlength="300"></label><button class="day-primary" type="submit">Confirmar lo recibido</button></form></details>':'')+'</article>';
  }
  draw(){
    const maySend=this.admin&&this.depot?.depotProducts?.some(p=>p.current>0);
    this.innerHTML='<section><h2>Paquetes de Tierra</h2><p role="alert" data-feedback>'+esc(this.message||"")+'</p>'+
      (this.pending?'<p>Hay un guardado pendiente. Verificalo antes de registrar otro paquete.</p><button data-verify-package type="button" class="day-primary">Verificar guardado pendiente</button>':
      maySend?'<details class="day-disclosure"><summary>Preparar paquete desde Tierra</summary><p>El stock de Tierra baja cuando confirmás el despacho. El barco suma la cantidad recién cuando confirma la recepción.</p>'+
      '<form data-package-send><div data-send-lines>'+this.sendLine()+'</div><button type="button" class="day-secondary" data-add-line>Agregar producto</button>'+
      this.photoLabel('Foto del paquete antes de despachar')+'<button class="day-primary" type="submit">Confirmar despacho</button></form></details>':
      this.depot?'<p>No hay existencias en Tierra para despachar.</p>':'')+
      (this.packages.length?this.packages.map(p=>this.shipCard(p)).join(""):'<p>No hay paquetes de Tierra para este barco.</p>')+'</section>';
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
      form.onchange=e=>{if(e.target.name==="targetProductId"){e.target.closest("[data-receive-line]").querySelector('[name=location]').value=e.target.selectedOptions[0]?.dataset.location||"";}};
      form.onsubmit=e=>{e.preventDefault();const items=[...form.querySelectorAll("[data-receive-line]")].map(row=>({
        lineId:row.dataset.receiveLine,quantity:Number(row.querySelector('[name=quantity]').value),location:row.querySelector('[name=location]').value.trim(),
        targetProductId:row.querySelector('[name=targetProductId]')?.value||undefined
      })).filter(l=>l.quantity>0);void this.save("receive",form,{id:form.dataset.packageReceive,items,note:form.elements.note.value});};
    }
    const verify=this.querySelector("[data-verify-package]");if(verify)verify.onclick=()=>this.save();
  }
  async save(op,form,data){
    if(!this.alive()||this.busy)return;
    const button=form?.querySelector('[type=submit]')||this.querySelector("[data-verify-package]");
    this.busy=true;if(button)button.disabled=true;
    const feedback=this.querySelector("[data-feedback]");feedback.textContent="";
    try {
      let pending=this.pending;
      if(!pending){
        if(!data.items.length||op==="receive"&&data.items.some(l=>!l.location))throw Error("Indicá una cantidad recibida y su ubicación.");
        const file=form.elements.photo.files[0];
        if(!file)throw Error("Adjuntá la foto del paquete.");
        const image=await photo(file);
        if(!this.alive())return;
        const saved=await api('photos','POST',{boat:this.boat,data:image});
        if(!this.alive())return;
        const photoId=new URL(saved.url,location.origin).searchParams.get('id');
        pending={op,payload:{boat:this.boat,key:uid(),photo:photoId,...data}};
        const claimed=await editStoredDraft(this.key,old=>old||pending);
        this.pending=claimed;
        if(claimed.payload.key!==pending.payload.key){this.message="Verificá primero el guardado anterior.";this.draw();return;}
      }
      if(!this.alive())return;
      await this.fetch(pending.op,pending.payload);
      await editStoredDraft(this.key,old=>old?.payload.key===pending.payload.key?null:old);
      this.pending=null;
      if(!this.alive())return;
      toast(pending.op==="send"?"Paquete despachado. Aviso registrado.":"Recepción guardada en el stock del barco.");
      if(this.parent)await this.parent.read();else await opsAfterSave();
    }catch(err){
      this.message=err.message;
      if(this.pending&&[400,409,403].includes(err.status)){
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
