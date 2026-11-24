const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/a-bordo/briefs.js','utf8');
const row={id:'synthetic',name:'Guest fixture',status:'confirmed',start:'2026-11-27',end:'2026-11-30',guests:2,briefVersion:0,operationalPreview:{charterType:'shared',transportRequired:true,transportStatus:'confirmed',confirmedTransferTimes:[{direction:'outbound',pickupAt:'2026-11-27T11:00:00+00:00'}]},phone:'PRIVATE',toCollectUsd:918};
function app(role='capitan',admin=false){
 const listeners={};const ctx={document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn)},getElementById(){return null}},role,session:{id:'qa',admin},boatId:'fixture',dayPage:'ops-agenda',state:{boat:{name:'Nomade'}},opsReservations:[],opsReservationsView:()=>'',URLSearchParams,location:{pathname:'/a-bordo/',search:'?boat=fixture'},dayGuestCashOwner:null,history:{replaceState(_a,_b,url){ctx.location.search=url.slice(url.indexOf('?'));}},setTimeout:fn=>fn(),date:x=>x,empty:x=>x,esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),render(){ctx.last=ctx.briefReservationsView()}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 ctx.briefAgendaEnsure=()=>({rows:[row],loading:false,error:''});
 const open=()=>listeners.click.at(-1)({target:{closest(css){return css==='[data-agenda-open]'?{dataset:{agendaOpen:'synthetic'}}:null}}});
 return {ctx,open};
}
test('actual Agenda click renders positive server card for captain, no private or payment fields',()=>{
 const {ctx,open}=app();open();
 assert.match(ctx.last,/Ficha operativa de la reserva/);
 assert.match(ctx.last,/Modalidad: Compartido. Traslado: Confirmado/);
 assert.match(ctx.last,/Recogida de traslado \(ida\):.*6:00/);
 assert.doesNotMatch(ctx.last,/PRIVATE|918|data-brief-action="payment"|Guardar borrador/);
 ctx.briefAgendaEnsure=()=>({rows:[{...row,operationalPreview:undefined}],loading:false,error:''});
 assert.doesNotMatch(ctx.briefReservationsView(),/Ficha operativa de la reserva/);
 for(const role of ['chef','marinero','encargado']){
  const {ctx,open}=app(role);open();assert.doesNotMatch(ctx.last,/Ficha operativa de la reserva/);
 }
});
test('only a linked admin agenda row opens existing draft editor; general guest directory unchanged',()=>{
 const {ctx,open}=app('administrador',true);
 ctx.opsReservations=[{...row,brief:{version:0,revision:5,draft:{transport:'Original'}}}];
 open();assert.match(ctx.last,/guest-admin" open/);assert.match(ctx.last,/Completar o corregir la ficha/);
 assert.match(ctx.last,/data-operation="brief_save"/);assert.match(ctx.last,/data-revision="5"/);
 assert.match(ctx.last,/Volver a la agenda del mes/);assert.doesNotMatch(ctx.last,/data-brief-action="payment"/);
 ctx.dayPage='ops-reservations';open();assert.doesNotMatch(ctx.last,/guest-admin" open/);
 ctx.opsReservations=[];ctx.dayPage='ops-agenda';open();assert.doesNotMatch(ctx.last,/data-operation="brief_save"/);
});
