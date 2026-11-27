const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const htmlEscape=(value)=>String(value??'').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[m]);
const callbacks={};
const context=vm.createContext({
 session:{id:'admin',admin:true},boatId:'nomad',role:'administrador',dayPage:'ops-stock',expenseBusy:false,
 state:{boat:{name:'Nomadé'},products:[
  {id:'beverage',area:'gastronomia',name:'Coca Zero x 24',unit:'un',current:3,location:'Recepción a bordo'},
  {id:'component',area:'tecnica',name:'Solenoide 12 V',unit:'un',current:1,location:'Pañol',code:'SOL-01'},
  {id:'old',name:'Manual técnico',unit:'un',current:1,location:'Pañol'}]},
 esc:htmlEscape,dayNormalize:s=>String(s).toLowerCase(),writable:()=>context.session.admin,
 dayManager:()=>context.session.admin,canViewFleetStock:()=>true,action:(op,label,id)=>'<button data-action="'+op+'" data-id="'+id+'">'+label+'</button>',
 document:{addEventListener:(k,cb)=>{callbacks[k]=cb;}},renderDay(){},loadBoat(){},renderFood(){},render(){},HTMLElement:class{},customElements:{define(){}}
});
const ops=fs.readFileSync('public/a-bordo/operations.js','utf8');
vm.runInContext(ops,context);
vm.runInContext("opsData={requests:[],fleet:[{id:'nomad',name:'Nomadé'},{id:'pink',name:'Pink Flamingo'}],transfers:[]}",context);
const stock=()=>vm.runInContext('opsStock()',context);
(async()=>{
 let h=stock();assert.match(h,/Stock · Nomadé/);assert.match(h,/Coca Zero x 24/);assert.doesNotMatch(h,/Solenoide|Manual técnico/);
 assert.match(h,/Stock general · Tierra y barcos/);assert.match(h,/Sale de Recepción a bordo y entra a Heladera/);assert.match(h,/data-operation="fridge_move" data-id="beverage"/);
 const b={dataset:{op:'stock_tab',id:'tecnica'}};await callbacks.click({target:{closest:()=>b}});
 h=stock();assert.doesNotMatch(h,/Coca Zero|data-intake="ticket"/);assert.match(h,/Solenoide 12 V/);assert.match(h,/Manual técnico/);
 assert.match(h,/data-operation="stock_add" data-id=""/);assert.match(h,/name="area" value="tecnica"/);
 assert.match(h,/name="unit" type="text" value="un"/);assert.match(h,/Nombre del repuesto/);
 assert.match(h,/data-action="editProduct" data-id="component"/);assert.match(h,/Pink Flamingo/);
 context.session={id:'chef',admin:false};context.role='chef';await callbacks.click({target:{closest:()=>b}});
 h=stock();assert.match(h,/Solenoide 12 V/);assert.doesNotMatch(h,/Editar ficha|Agregar repuesto|Stock general/);
 context.session={id:'reader',admin:false};context.role='lector';h=stock();assert.doesNotMatch(h,/data-operation="fridge_move"/);
 context.boatId='pink';context.state.boat.name='Pink Flamingo';context.state.products=[];
 h=stock();assert.match(h,/Stock · Pink Flamingo/);assert.doesNotMatch(h,/Solenoide/);assert.match(h,/gastronomia" class="day-primary"/);
 const admin=fs.readFileSync('public/a-bordo/admin-stock.js','utf8');assert.match(admin,/scope:'depot'/);assert.match(admin,/<option value="depot">Tierra<\/option>/);
 assert.match(admin,/d\.boats\.map/);assert.match(admin,/this\.itemList\("gastronomia"\)\+this\.itemList\("tecnica"\)/);
 console.log('Boat stock tabs, add/edit spare, boat isolation and real Tierra/boat selector passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
