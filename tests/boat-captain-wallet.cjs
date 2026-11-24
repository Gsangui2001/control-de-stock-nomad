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
const due={id:'yes',name:'Huésped A',brief:{version:1},details:{captainCollection:'collect'},captainBalance:{status:'known',amountUsd:275,reportedCount:0}};
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
