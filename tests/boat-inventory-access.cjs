const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const sandbox={document:{addEventListener(){}},setInterval(){},renderDay(){},loadBoat(){},
 session:{id:'fixture',admin:false},role:'chef',boatId:'fixture-boat',
 state:{boat:{name:'Fixture'},products:[]},esc:String,empty:String,
 writable:()=>sandbox.role!=='lector',dayManager:()=>sandbox.session.admin||sandbox.role==='encargado',
 dayNormalize:s=>String(s).toLowerCase()};
vm.createContext(sandbox);
for(const file of ['operations.js','fleet-stock.js','intake.js'])vm.runInContext(fs.readFileSync('public/a-bordo/'+file,'utf8'),sandbox);
vm.runInContext("opsData={requests:[],fleet:[]};intakeDocs=[];intakeBoat=intakeContext().draftKey;",sandbox);
for(const role of ['administrador','capitan','chef','marinero','lector','encargado']){
 sandbox.role=role;sandbox.session.admin=role==='administrador';
 const stock=vm.runInContext('opsStock()',sandbox);
 assert.equal(stock.includes('Stock de otros barcos'),['administrador','capitan'].includes(role),role+' fleet navigation');
 assert.equal(stock.includes('Cargar ticket y sumar stock'),sandbox.session.admin,role+' ticket navigation');
 assert.equal(stock.includes('Cargar cantidad contada'),sandbox.session.admin,role+' initial stock');
 const intake=vm.runInContext('intakeView()',sandbox);
 assert.equal(intake.includes('id="intakeInput"'),sandbox.session.admin,role+' intake form');
 if(!['administrador','capitan'].includes(role)){
  vm.runInContext("fleetStockData=[{name:'PRIVATE'}]",sandbox);
  assert.ok(!vm.runInContext('fleetStockView()',sandbox).includes('PRIVATE'),'cached fleet hidden from '+role);
  assert.equal(vm.runInContext('fleetStockData',sandbox),null,'cached fleet cleared');
 }
}
console.log('PASS: captain/admin fleet visibility, administrator-only tickets and initial stock, denied cached data');
