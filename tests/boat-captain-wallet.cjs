const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('public/a-bordo/captain-cash.js','utf8');
function app(role,admin=false){
 const pending=[];
 const ctx={role,session:{id:'actor',admin},boatId:'boat-a',dayPage:'ops-cash',
  document:{addEventListener(){}},opsFetch:(operation,body,boat)=>new Promise((resolve,reject)=>pending.push({operation,boat,resolve,reject})),
  esc:t=>String(t??'').replaceAll('<','&lt;'),date:v=>v,briefTime:v=>v,render(){},empty:t=>t,
  opsForm:(op,body)=>'<form data-operation="'+op+'">'+body+'</form>',opsField:label=>label,
  opsReservations:[]};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,pending};
}
const wallet={captainId:'a',name:'Capitán Uno',balances:[{currency:'EUR',opening:20,incoming:0,spent:4,balance:16},{currency:'USD',opening:null,incoming:99,spent:0,balance:null}],receipts:[],expenses:[]};
const due={id:'yes',name:'Huésped A',start:'2020-11-24',brief:{version:1},details:{captainCollection:'collect'},captainBalance:{status:'known',amountUsd:275,reportedCount:0}};
test('captain sees own cash, unknown opening and only authorized guest cards; admin can enter a count',async()=>{
 const a=app('capitan');
 a.ctx.opsReservations=[due,...[{cashAssigned:false},{cashLegacyReview:true},{captainPayment:{status:'cleared'}},{brief:{version:1,sourceChanged:true}},{details:{captainCollection:'pending'}}].map((row,i)=>({...due,...row,id:'blocked'+i}))];
 assert.match(a.ctx.captainCashView(),/Cargando/);assert.equal(a.pending.length,1);
 a.pending[0].resolve({wallets:[wallet]});await new Promise(r=>setImmediate(r));
 const view=a.ctx.captainCashView();assert.match(view,/Mi efectivo/);assert.match(view,/EUR 16,00/);assert.match(view,/Conteo inicial pendiente/);
 assert.match(view,/USD 275,00/);assert.match(view,/data-agenda-open="yes"/);assert.doesNotMatch(view,/blocked|proveedores|captain_opening/);
 assert.match(view,/captain_expense/);
 const {ctx,pending}=app('administrador',true);ctx.captainCashView();pending[0].resolve({wallets:[wallet]});await new Promise(r=>setImmediate(r));
 const admin=ctx.captainCashView();assert.match(admin,/captain_opening/);assert.doesNotMatch(admin,/captain_expense/);
 for(const role of ['chef','marinero']){const a=app(role);assert.match(a.ctx.captainCashView(),/no disponible/);assert.equal(a.pending.length,0);}
});
test('each wallet shows collected, spent and handed over; only administration can record a handover',async()=>{
 const handed={...wallet,balances:[{currency:'USD',opening:10,incoming:1680.5,spent:30,balance:660.5,handed_over:1000}],
  handovers:[{id:7,currency:'USD',amount:1000,concept:'Sobre <cerrado>',at:'2026-11-25T12:00:00Z',receivedBy:'Administración QA'}]};
 const captain=app('capitan');captain.ctx.captainCashView();captain.pending[0].resolve({wallets:[handed]});await new Promise(r=>setImmediate(r));
 const own=captain.ctx.captainCashView();
 assert.match(own,/USD 660,50/);assert.match(own,/Cobrado USD 1\.680,50 · Gastado USD 30,00 · Entregado USD 1\.000,00/);
 assert.match(own,/Entregas \(1\)/);assert.match(own,/USD 1\.000,00<\/strong> · Sobre &lt;cerrado> · 2026-11-25T12:00:00Z · Recibió Administración QA/);
 assert.doesNotMatch(own,/captain_handover|Registrar entrega/);
 const admin=app('administrador',true);admin.ctx.captainCashView();admin.pending[0].resolve({wallets:[handed,{...wallet,captainId:'b',name:'Capitán Dos'}]});
 await new Promise(r=>setImmediate(r));
 const view=admin.ctx.captainCashView();
 assert.match(view,/<summary>Registrar entrega<\/summary>/);assert.match(view,/data-operation="captain_handover"/);
 const form=view.slice(view.indexOf('data-operation="captain_handover"'));
 assert.match(form,/<option value="a">Capitán Uno<\/option><option value="b">Capitán Dos<\/option>/);
 assert.match(form,/name="currency"/);assert.match(form,/Importe entregado/);assert.match(form,/Nota \(opcional\)/);
 // A server without handovers yet still renders the wallet.
 assert.match(view,/Entregas \(0\)/);assert.match(view,/Entregado EUR 0,00/);
 const empty=app('administrador',true);empty.ctx.captainCashView();empty.pending[0].resolve({wallets:[]});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(empty.ctx.captainCashView(),/captain_handover/);
});
test('a wallet response from a previous boat cannot become visible after switching',async()=>{
 const {ctx,pending}=app('capitan');ctx.captainCashView();ctx.boatId='boat-b';ctx.captainCashView();
 assert.deepEqual(pending.map(p=>p.boat),['boat-a','boat-b']);pending[0].resolve({wallets:[wallet]});
 await new Promise(r=>setImmediate(r));assert.match(ctx.captainCashView(),/Cargando/);
 pending[1].resolve({wallets:[]});await new Promise(r=>setImmediate(r));assert.match(ctx.captainCashView(),/no hay un capitán/);
});
test('refresh distinguishes failed and empty guest lists and rejects a delayed response after a new session',async()=>{
 const {ctx,pending}=app('capitan');
 ctx.captainCashView();pending.shift().resolve({wallets:[wallet]});await new Promise(r=>setImmediate(r));
 const refresh=ctx.loadCaptainCash(true);
 assert.match(ctx.captainCashView(),/Actualizando cobros/);
 assert.deepEqual(pending.map(x=>x.operation),['captain_wallet','reservations']);
 pending.shift().resolve({wallets:[wallet]});pending.shift().reject(Error('sin conexión'));await refresh;
 const failed=ctx.captainCashView();assert.match(failed,/No se pudieron verificar los cobros/);assert.doesNotMatch(failed,/No tenés cobros autorizados/);
 const recovered=ctx.loadCaptainCash(true);pending.shift().resolve({wallets:[wallet]});pending.shift().resolve([]);await recovered;
 assert.match(ctx.captainCashView(),/No tenés cobros autorizados/);
 const stale=ctx.loadCaptainCash(true),[oldWallet,oldBookings]=pending.splice(0);
 ctx.session={id:'actor',admin:false};ctx.captainCashView();
 oldBookings.resolve([due]);oldWallet.resolve({wallets:[wallet]});await stale;
 assert.equal(ctx.opsReservations.length,0);assert.match(ctx.captainCashView(),/Cargando/);
 pending.shift().resolve({wallets:[]});await new Promise(r=>setImmediate(r));
});

test('por cobrar sale primero desde la fecha local y no se agrega al efectivo',async()=>{
 const a=app('capitan');
 assert.equal(a.ctx.captainPanamaDay(new Date('2026-11-26T04:59:59Z')),'2026-11-25');
 assert.equal(a.ctx.captainPanamaDay(new Date('2026-11-26T05:00:00Z')),'2026-11-26');
 assert.deepEqual(Array.from(a.ctx.captainPendingCollections([due,{...due,id:'future',start:'2026-11-27'},{...due,id:'cancelled',status:'cancelled'}],'2026-11-26'),r=>r.id),['yes']);
 a.ctx.opsReservations=[due];a.ctx.captainCashView();a.pending[0].resolve({wallets:[wallet]});
 await new Promise(r=>setImmediate(r));const view=a.ctx.captainCashView();
 assert.ok(view.indexOf('Por cobrar USD 275,00') < view.indexOf('Efectivo disponible'));
 assert.match(view,/No es efectivo en caja/);assert.match(view,/Cobrado USD 99,00/);
});

test('personal cash labels separate company and physical balances without locking legacy UI',async()=>{
 const a=app('capitan');a.ctx.captainCashView();
 const en={...wallet,balances:[{currency:'USD',opening:50,incoming:1500,spent:45,handed_over:5,balance:1500}],
  personal:[{currency:'USD',contributed:55,withdrawn:10,spent:40,reimbursed:15}],
  personalEntries:[{kind:'personal_spend',currency:'USD',amount:40,concept:'Repuesto <costoso>',at:'2026-11-25'}]};
 a.pending[0].resolve({wallets:[en],personalCashVersion:1});await new Promise(r=>setImmediate(r));
 const view=a.ctx.captainCashView();
 assert.match(view,/Saldo de Nomad en caja · USD<\/h3><strong>USD 1\.500,00/);
 assert.match(view,/Efectivo físico: USD 1\.545,00/);
 assert.match(view,/Gastos de bolsillo por recuperar: USD 25,00/);
 assert.match(view,/Ingreso capitán/);assert.match(view,/Extracción capitán/);
 assert.match(view,/Ingreso cliente/);assert.match(view,/Extracción Gustavo\/Boris/);
 assert.match(view,/Repuesto &lt;costoso>/);
 assert.match(view,/data-operation="captain_personal_movement"/);
 const admin=app('administrador',true);admin.ctx.captainCashView();admin.pending[0].resolve({wallets:[en],personalCashVersion:1});await new Promise(r=>setImmediate(r));
 assert.doesNotMatch(admin.ctx.captainCashView(),/data-operation="captain_personal_movement"/);
});
