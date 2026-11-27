"use strict";

const depotNameKey = value => String(value ?? "").trim().normalize("NFC").toLocaleLowerCase("es");
const depotUnitKey = value => {
  const v = depotNameKey(value);
  return ({un:"unidad", unidades:"unidad", uds:"unidad", ud:"unidad", litros:"l", litro:"l", gr:"g",
    cajas:"caja", bolsas:"bolsa", botellas:"botella", paquetes:"paquete", latas:"lata", rollos:"rollo"})[v] || v;
};

function depotPhotoItems(read, products, group, defaultUnits, selections = []) {
  return read.map((row, index) => {
    const countUnits=["unidad","lata","botella"];
    const matches = products.filter(p => depotNameKey(p.name)===depotNameKey(row.name)
      && (!row.unit || depotUnitKey(row.unit)===depotUnitKey(p.unit) || (depotUnitKey(row.unit)==="unidad"&&countUnits.includes(depotUnitKey(p.unit))))
      && (!row.location || depotNameKey(row.location)===depotNameKey(p.location)));
    const picked = matches.find(p=>p.id===selections[index]) || (matches.length===1?matches[0]:null);
    const name = picked?.name || row.name;
    const unit = picked?.unit || row.unit || (defaultUnits?"unidad":"");
    const location = picked?.location || row.location || "Depósito principal";
    const area = picked?.area || (picked?"tecnica":group);
    const reason = !name || !Number.isFinite(row.quantity) || row.quantity<0 || row.quantity>=1e9 ? "Cantidad o producto ilegible"
      : matches.length>1&&!picked ? "Elegí el artículo correcto"
      : !unit ? "Falta unidad"
      : !area ? "Elegí el área para los productos nuevos" : "";
    return {name, unit, location, area, quantity:row.quantity, productId:picked?.id, reason, choices:matches.length>1?matches:[]};
  });
}

class DepotPhotoCount extends HTMLElement {
  connectedCallback() {
    const owner = session?.admin && session.id;
    if(!owner) return;
    this.owner=owner;
    this.revision=Number(this.dataset.revision);
    this.products=this.closest("boat-admin-stock").data.products;
    this.pendingKey="depot-photo-pending:"+owner;
    this.selections=[];
    this.mode="replenish";
    this.draw();
    draftRead(this.pendingKey).then(pending=>{
      if(this.active() && pending){this.pending=pending; this.draw();}
    }).catch(()=>{if(this.active()){this.message="No se pudieron revisar los guardados pendientes.";this.draw();}});
  }

  active(){return this.isConnected && session?.admin && session.id===this.owner;}
  async post(op, body){
    const response=await fetch("/api/boat-ops/"+op,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const value=await response.json().catch(()=>({}));
    if(!response.ok) throw Object.assign(Error(value.error||"No se pudo completar la operación."),{status:response.status});
    return value;
  }

  draw(){
    const rows=depotPhotoItems(this.rows||[],this.products,this.group,this.defaultUnits,this.selections).map(r=>this.mode==="replenish"&&r.quantity===0?{...r,reason:"La mercadería ingresada debe ser mayor a cero"}:r);
    this.innerHTML='<section><h2>Cargar stock con una foto</h2><p>Sacá una foto del ticket o de una lista legible. Si la presentación es clara, las fundas se convierten a unidades. Revisá antes de confirmar.</p>'+
      (this.pending?'':'<label>Qué estás cargando<select data-mode><option value="count">Conteo real · reemplaza lo contado</option><option value="replenish">Ingreso de mercadería · suma lo que llegó</option></select></label>')+
      (this.pending?'': '<div class="area-actions"><button type="button" class="day-primary" data-acquire="camera">Sacar foto</button><button type="button" class="day-secondary" data-acquire="gallery">Elegir foto</button></div>'+
      '<input type="file" accept="image/*" capture="environment" data-source="camera" hidden><input type="file" accept="image/*" data-source="gallery" hidden>')+
      '<p data-progress role="status"></p><p role="alert">'+esc(this.message||"")+'</p>'+
      (this.pending?'<p>Hay un conteo sin confirmar. Verificá ese guardado antes de cargar otro.</p><button type="button" class="day-primary" data-verify>Verificar guardado pendiente</button>':
      rows.length?'<label>Área para productos nuevos<select data-group><option value="">Elegí un área</option><option value="gastronomia">Alimentos y bebidas</option><option value="tecnica">Materiales, repuestos y limpieza</option></select></label>'+
      '<label class="check"><input type="checkbox" data-default-units>Las cantidades sin unidad son unidades</label>'+
      rows.map((r,i)=>'<article class="day-inventory"><strong>'+esc(r.name||'Producto sin identificar')+'</strong><p>'+
        esc(Number.isFinite(r.quantity)?String(r.quantity)+' '+r.unit:'Cantidad no leída')+' · '+esc(r.location)+(r.area?' · '+esc(r.area==='gastronomia'?'Alimentos y bebidas':'Materiales, repuestos y limpieza'):'')+'</p>'+
        (r.reason?'<p class="form-error">'+esc(r.reason)+'</p>':'')+
        (r.choices.length?'<label>Artículo existente<select data-choice="'+i+'"><option value="">Elegí un artículo</option>'+r.choices.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name+' · '+x.unit+' · '+x.location)+'</option>').join("")+'</select></label>':'')+'</article>').join("")+
      '<button type="button" class="day-primary" data-confirm '+(rows.some(r=>r.reason)?'disabled':'')+'>Confirmar y actualizar Stock Tierra</button>':'')+'</section>';
    const mode=this.querySelector("[data-mode]");if(mode){mode.value=this.mode;mode.onchange=()=>{this.mode=mode.value;this.draw();};}
    const group=this.querySelector("[data-group]"); if(group){group.value=this.group||"";group.onchange=()=>{this.group=group.value;this.draw();};}
    const defaults=this.querySelector("[data-default-units]");if(defaults){defaults.checked=!!this.defaultUnits;defaults.onchange=()=>{this.defaultUnits=defaults.checked;this.draw();};}
    for(const choice of this.querySelectorAll("[data-choice]")){const i=Number(choice.dataset.choice);choice.value=this.selections[i]||"";choice.onchange=()=>{this.selections[i]=choice.value;this.draw();};}
    for(const btn of this.querySelectorAll("[data-acquire]"))btn.onclick=()=>{if(!this.busy)this.querySelector('[data-source="'+btn.dataset.acquire+'"]').click();};
    for(const input of this.querySelectorAll("[data-source]"))input.onchange=()=>{if(input.files[0])void this.scan(input.files[0]);};
    const confirm=this.querySelector("[data-confirm]");if(confirm)confirm.onclick=()=>this.save(rows);
    const verify=this.querySelector("[data-verify]");if(verify)verify.onclick=()=>this.save();
  }

  async scan(file){
    if(!this.active()||this.busy||this.pending)return;
    this.busy=true; this.message=""; this.rows=null; this.selections=[]; this.draw();
    const progress=this.querySelector("[data-progress]"); progress.textContent="Leyendo foto…";
    try{
      if(file.size>12000000)throw Error("La foto supera 12 MB. Probá con una foto más chica.");
      if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("La foto debe estar en JPG, PNG o WebP.");
      const recognized=(await intakeOcr([await photo(file)],progress)).trim();
      if(!this.active())return;
      if(!recognized)throw Error("No pude leer la lista. Probá otra foto, de frente y con buena luz.");
      const result=await this.post("warehouse_photo_read",{scope:"depot",text:recognized});
      if(!result.items?.length)throw Error("No encontré productos. Probá otra foto.");
      this.rows=result.items;
    }catch(error){this.message=error.message;}
    finally{this.busy=false;if(this.active())this.draw();}
  }

  async save(rows){
    if(!this.active()||this.busy||(!this.pending&&(!rows?.length||rows.some(r=>r.reason))))return;
    this.busy=true;
    try{
      const payload=this.pending||{scope:"depot",mode:this.mode,revision:this.revision,confirmed:true,key:uid(),
        items:rows.map(({name,unit,location,area,quantity,productId})=>({name,unit,location,area,quantity,productId}))};
      const stored=await editStoredDraft(this.pendingKey,old=>old||payload);
      this.pending=stored;
      if(!this.active())return;
      if(stored.key!==payload.key){this.message="Hay otro guardado pendiente. Verificalo primero.";return;}
      await this.post("warehouse_photo_count",stored);
      await editStoredDraft(this.pendingKey,old=>old?.key===stored.key?null:old);
      this.pending=null;
      if(this.active()){toast("Conteo de Stock Tierra guardado.");void this.closest("boat-admin-stock").read();}
    }catch(error){
      this.message=error.message;
      if(this.pending && [400,409].includes(error.status)){
        const key=this.pending.key;
        try{await editStoredDraft(this.pendingKey,old=>old?.key===key?null:old);this.pending=null;}catch{ /* Keep recoverable receipt id. */ }
        if(error.status===409&&this.active()){
          this.rows=null;
          const parent=this.closest("boat-admin-stock");
          // Reload current stock before accepting another photo.
          const message=this.message;
          await parent.read();
          const panel=parent.querySelector("depot-photo-count");
          if(panel){panel.message=message;panel.draw();}
        }
      }
    }finally{this.busy=false;if(this.active())this.draw();}
  }
}
customElements.define("depot-photo-count", DepotPhotoCount);
