"use strict";
const canViewFleetStock=()=>Boolean(session?.admin||role==='capitan');
let fleetStockData=null,fleetStockOwner='',fleetStockLoading=false,fleetStockError='',fleetStockToken=0;
let fleetStockFilters={query:'',area:'',boat:''};
async function fleetStockReload(){
 if(!canViewFleetStock()){fleetStockData=null;fleetStockError='Acceso reservado a capitanes y administrador.';return;}
 const owner=session.id+':'+boatId,token=++fleetStockToken;
 fleetStockLoading=true;fleetStockError='';
 try{const data=await opsFetch('fleet_stock');if(token!==fleetStockToken||owner!==session.id+':'+boatId)return;fleetStockData=data;}
 catch(e){if(token===fleetStockToken)fleetStockError=e.message;}
 finally{if(token===fleetStockToken){fleetStockLoading=false;if(view==='day'&&dayPage==='ops-fleet')render();}}
}
function fleetStockView(){
 if(!canViewFleetStock()){fleetStockData=null;return '<p class="day-note">El stock de otros barcos está disponible para capitanes y administrador.</p>';}
 const owner=session.id+':'+boatId;
 if(owner!==fleetStockOwner){fleetStockOwner=owner;fleetStockToken++;fleetStockData=null;fleetStockLoading=false;fleetStockError='';fleetStockFilters={query:'',area:'',boat:''};}
 if(!fleetStockData&&!fleetStockLoading&&!fleetStockError)fleetStockReload();
 const other=(fleetStockData||[]).filter(b=>b.id!==boatId);
 return `<h1>Stock de otros barcos</h1><p>Buscá bebidas, mercadería, materiales o repuestos disponibles en los barcos que usan A bordo. Coordiná con el responsable del barco antes de retirar un producto.</p>
 ${fleetStockError?`<p class="form-error" role="alert">No se pudo actualizar: ${esc(fleetStockError)}. ${fleetStockData?'Las cantidades visibles son de la última consulta.':''}</p>`:''}
 ${fleetStockLoading?'<p role="status">Consultando existencias…</p>':''}
 <label>Buscar producto, referencia o ubicación<input id="fleetStockSearch" type="search" value="${esc(fleetStockFilters.query)}" placeholder="Agua, arroz, filtro, bomba…"></label>
 <label>Tipo de stock<select id="fleetStockArea"><option value="">Todo el stock</option><option value="gastronomia">Bebidas y mercadería</option><option value="tecnica">Materiales, repuestos y limpieza</option></select></label>
 <label>Barco<select id="fleetStockBoat"><option value="">Todos los otros barcos</option>${other.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>
 <p class="day-muted">Consulta de existencias registradas. Un barco sin conteo cargado no significa que esté vacío. Usá Actualizar para consultar nuevamente.</p>
 <div id="fleetStockList">${other.map(b=>`<section data-fleet-boat="${esc(b.id)}"><h2>${esc(b.name)}</h2>${b.products.length?b.products.map(p=>`<article class="day-inventory" data-fleet-product data-area="${esc(p.area)}" data-search="${esc(dayNormalize([p.name,p.code,p.specs,p.system,p.location].join(' ')))}"><div class="day-card-heading"><h3>${esc(p.name)}</h3><strong>${typeof p.current==='number'?esc(p.current)+' '+esc(p.unit):'Conteo pendiente'}</strong></div><p>${esc(p.area==='gastronomia'?'Bebidas y mercadería':'Materiales y repuestos')} · ${esc(p.location||'Ubicación sin definir')}</p>${p.code||p.specs?`<p>${esc([p.code,p.specs].filter(Boolean).join(' · '))}</p>`:''}${p.expiryDate?`<p>Vence ${date(p.expiryDate)}</p>`:''}</article>`).join(''):'<p data-fleet-empty>Conteo inicial pendiente.</p>'}</section>`).join('')}</div>
 ${fleetStockData&&!other.length?'<p>Todavía no hay otros barcos registrados en A bordo.</p>':''}<p id="fleetStockNoMatch" hidden>No hay productos que coincidan con la búsqueda.</p>`;
}
function fleetStockBind(){
 for(const [id,key,event] of [['fleetStockSearch','query','input'],['fleetStockArea','area','change'],['fleetStockBoat','boat','change']]){
  const el=document.getElementById(id);if(!el)continue;el.value=fleetStockFilters[key];el.addEventListener(event,()=>{fleetStockFilters[key]=el.value;fleetStockFilter();});
 }
 fleetStockFilter();
}
function fleetStockFilter(){
 const {query,area,boat}=fleetStockFilters;let visible=0;
 document.querySelectorAll('[data-fleet-boat]').forEach(section=>{
  let count=0;section.querySelectorAll('[data-fleet-product]').forEach(item=>{item.hidden=!!((area&&item.dataset.area!==area)||!item.dataset.search.includes(dayNormalize(query)));if(!item.hidden)count++;});
  section.hidden=!!((boat&&section.dataset.fleetBoat!==boat)||(!count&&(query||area||!section.querySelector('[data-fleet-empty]'))));
  if(!section.hidden)visible++;
 });
 const empty=document.getElementById('fleetStockNoMatch');if(empty)empty.hidden=visible>0||!(fleetStockData||[]).some(b=>b.id!==boatId);
}
