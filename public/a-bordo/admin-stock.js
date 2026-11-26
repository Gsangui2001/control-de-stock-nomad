"use strict";

// Keep the selected location when the operational screen refreshes after a save.
let adminStockSelection = null;

class BoatAdminStock extends HTMLElement {
  connectedCallback() {
    if (!session?.admin) return;
    this.owner = session.id + ":" + boatId;
    if (adminStockSelection?.owner !== this.owner) adminStockSelection = {owner:this.owner,scope:boatId};
    this.read();
  }

  disconnectedCallback() { this.request?.abort(); }

  async read() {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const scope = adminStockSelection.scope;
    this.innerHTML = '<h1>Stock de barcos y depósito</h1><p role="status">Consultando el inventario…</p>';
    try {
      const url = "/api/boat-ops/warehouse_dashboard?" + new URLSearchParams({boat:boatId, scope});
      const response = await fetch(url, {cache:"no-store",signal:request.signal});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "No se pudo consultar el inventario.");
      if (!this.isConnected || request.signal.aborted || !session?.admin || this.owner !== session.id + ":" + boatId) return;
      this.data = data;
      this.draw();
    } catch (error) {
      if (request.signal.aborted) return;
      this.innerHTML = '<h1>Stock de barcos y depósito</h1><p role="alert">'+esc(error.message)+'</p><button type="button" class="day-secondary">Volver a intentar</button>';
      this.querySelector("button").onclick = () => this.read();
    }
  }

  choose(scope) {
    if (opsBusy || !this.isConnected) return;
    adminStockSelection.scope = scope;
    this.read();
  }

  itemList(area) {
    const rows = this.data.products.filter(p => (p.area || "tecnica") === area);
    const title = area === "gastronomia" ? "Mercadería · bebidas y comestibles" : "Herramientas, materiales y repuestos";
    return '<section><h2>'+title+'</h2>' + (rows.length ? rows.map(p=>
      '<article class="day-inventory" data-admin-product="'+esc(dayNormalize([p.name,p.location,p.code].join(" ")))+'"><div class="day-card-heading"><h3>'+esc(p.name)+'</h3><strong>'+
      (typeof p.current === "number" ? esc(p.current)+" "+esc(p.unit) : "Conteo pendiente")+'</strong></div><p>'+esc(p.location || "Ubicación pendiente")+'</p></article>'
    ).join("") : '<p class="day-muted">Sin artículos registrados en este inventario.</p>') + '</section>';
  }

  amounts(label, values) {
    const entries = Object.entries(values || {});
    return '<p><strong>'+label+'</strong><br>'+ (entries.length ? entries.map(([currency,total])=>
      esc(currency)+" "+esc(Number(total).toLocaleString("es-AR",{maximumFractionDigits:2,minimumFractionDigits:2}))
    ).join(" · ") : "Sin importes registrados")+"</p>";
  }

  finance() {
    const d = this.data;
    const units = Object.entries(d.usedUnits || {}).map(([unit,q])=>esc(q)+" "+esc(unit));
    const missed = [];
    if(d.expensesMissing) missed.push(esc(d.expensesMissing)+" comprobantes sin importe o moneda");
    if(d.purchasesMissing) missed.push(esc(d.purchasesMissing)+" líneas de mercadería sin costo de compra");
    if(d.consumptionMissing) missed.push(esc(d.consumptionMissing)+" consumos de mercadería sin costo registrado");
    if(d.unclassifiedPurchases || d.unclassifiedConsumption) missed.push(esc((d.unclassifiedPurchases||0)+(d.unclassifiedConsumption||0))+" registros sin área identificada");
    return '<details class="day-disclosure"><summary>Gastos y consumo del barco</summary>'+
      this.amounts("Gastos registrados con comprobante",d.expenses)+this.amounts("Pagado a proveedores",d.paid)+
      (d.captainExpenses ? this.amounts("Gastos registrados en la caja del capitán",d.captainExpenses) : "")+
      this.amounts("Compras de mercadería con costo",d.groceryPurchases)+
      '<p><strong>Mercadería consumida</strong><br>'+(units.join(" · ") || "Sin consumos registrados")+'</p>'+
      this.amounts("Valor del consumo al costo registrado",d.groceryConsumption)+
      (missed.length?'<p class="day-note">'+missed.join(". ")+'.</p>':'')+
      '<p class="day-muted">Las compras de mercadería forman parte de los gastos del barco. Los pagos y el consumo se muestran por separado.</p></details>';
  }

  movements() {
    const d=this.data;
    return '<details class="day-disclosure"><summary>Movimientos de stock</summary>' +
      (d.movementCount>d.movements.length ? '<p>Últimos '+d.movements.length+' de '+esc(d.movementCount)+' movimientos.</p>' : '')+
      (d.movements.map(m=>'<article class="day-inventory"><h3>'+esc(m.name)+'</h3><p>'+
        (m.delta>0?"+":"")+esc(m.delta)+" "+esc(m.unit)+" · "+esc(m.reason)+" · "+date(m.date)+
        '</p><p class="day-muted">Saldo después del movimiento: '+esc(m.balance)+" "+esc(m.unit)+'</p></article>').join("") ||
        '<p class="day-muted">Sin movimientos registrados.</p>') + '</details>';
  }

  productOptions(products) {
    return products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+" · "+esc(p.location || "sin ubicación")+" · "+esc(p.current)+" "+esc(p.unit)+'</option>').join("");
  }

  countForm() {
    const d=this.data;
    const fields='<input type="hidden" name="revision" value="'+esc(d.depotRevision)+'">'+
      '<label>Artículo<select name="productId"><option value="">Nuevo artículo</option>'+this.productOptions(d.products)+'</select></label>'+
      opsArea()+opsField("Nombre","name","text","","required maxlength=140")+opsField("Unidad","unit","text","","required maxlength=20")+
      opsField("Lugar dentro del depósito","location","text","","required maxlength=140")+
      opsField("Cantidad contada","quantity","number","","required min=0 step=0.0001")+
      '<details><summary>Costo unitario del último comprobante</summary>'+opsField("Importe","unitCost","number","","min=0 step=0.0001")+
      '<label>Moneda<select name="currency"><option value="">Seleccioná la moneda</option><option>USD</option><option>EUR</option><option>ARS</option><option>PAB</option></select></label></details>';
    return '<details class="day-disclosure"><summary>Registrar conteo del depósito</summary>'+opsForm("warehouse_count",fields)+'</details>';
  }

  transfer(direction) {
    const d=this.data, toBoat=direction==="toBoat";
    const sources=(toBoat?d.depotProducts:d.products).filter(p=>p.current>0);
    if(!sources.length) return "";
    const fields='<input type="hidden" name="direction" value="'+direction+'"><input type="hidden" name="vessel" value="'+esc(d.scope)+'">'+
      '<label>Artículo de origen<select name="productId" required><option value="">Elegí un artículo</option>'+this.productOptions(sources)+'</select></label>'+
      opsAmount()+'<label>Ficha en destino<select name="targetProductId"><option value="">Usar la ubicación indicada</option></select></label>'+
      opsField("Ubicación en destino","location","text","","required maxlength=140");
    return '<details class="day-disclosure"><summary>'+(toBoat?"Recibir del depósito":"Enviar al depósito")+'</summary>'+opsForm("warehouse_transfer",fields,d.scope+"-"+direction)+'</details>';
  }

  draw() {
    const d=this.data, isDepot=d.scope==="depot";
    const choices=d.boats.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join("");
    this.innerHTML='<h1>Stock de barcos y depósito</h1><label>Inventario<select data-stock-scope>'+choices+
      '<option value="depot">'+esc(d.depot || "Depósito")+'</option></select></label>'+
        '<div class="area-actions">'+(isDepot ? "" : '<button type="button" class="day-secondary" data-boat-stock>Abrir stock de este barco</button>')+'</div>'+
        (isDepot?'<depot-photo-count data-revision="'+esc(d.depotRevision)+'"></depot-photo-count>':'')+(!isDepot && d.depot ? this.transfer("toBoat")+this.transfer("toDepot") : '')+
        (isDepot && d.boats.length ? '<p class="day-muted">Para trasladar existencias, elegí el barco en Inventario.</p>' : '')+
        (d.products.length?'<label>Buscar artículo o ubicación<input type="search" data-stock-filter></label>':'')+
        this.itemList("gastronomia")+this.itemList("tecnica")+this.movements()+(isDepot?"":this.finance());
    const selector=this.querySelector("[data-stock-scope]");
    selector.value=d.scope;
    selector.onchange=()=>this.choose(selector.value);
    const search=this.querySelector("[data-stock-filter]");
    if(search) search.oninput=()=>{
      const q=dayNormalize(search.value);
      for(const article of this.querySelectorAll("[data-admin-product]")) article.hidden=!article.dataset.adminProduct.includes(q);
    };
    const jump=this.querySelector("[data-boat-stock]");
    if(jump)jump.onclick=async()=>{
      jump.disabled=true;
      try { if(d.scope!==boatId) await loadBoat(d.scope); if(boatId===d.scope && session?.admin){dayPage="ops-stock";render();} }
      catch(error){toast(error.message);jump.disabled=false;}
    };
    for(const form of this.querySelectorAll('[data-operation="warehouse_count"],[data-operation="warehouse_transfer"]')){
      form.onchange=event=>{
        const fields=form.elements;
        if(event.target===fields.productId){
          if(form.dataset.operation==="warehouse_count"){
            const product=d.products.find(p=>p.id===fields.productId.value);
            for(const key of ["name","unit","location","area"]) fields[key].value=product?.[key] || (key==="area"?"gastronomia":"");
            fields.quantity.value="";
          }else{
            const toBoat=fields.direction.value==="toBoat";
            const source=(toBoat?d.depotProducts:d.products).find(p=>p.id===fields.productId.value);
            const target=(toBoat?d.products:d.depotProducts).filter(p=>source && dayNormalize(p.name)===dayNormalize(source.name) && dayNormalize(p.unit)===dayNormalize(source.unit) && (p.area||"tecnica")===(source.area||"tecnica"));
            fields.quantity.max=source?.current || "";
            fields.targetProductId.innerHTML='<option value="">Usar la ubicación indicada</option>'+this.productOptions(target);
            fields.location.value="";
          }
        }
        if(event.target===fields.targetProductId){
          const target=(fields.direction.value==="toBoat"?d.products:d.depotProducts).find(p=>p.id===fields.targetProductId.value);
          fields.location.value=target?.location||"";
        }
      };
    }
  }
}
customElements.define("boat-admin-stock",BoatAdminStock);
