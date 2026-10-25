const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function app(admin=false){
 const ctx={document:{addEventListener(){}},URLSearchParams,location:{search:''},session:{admin},role:'chef',state:{boat:{name:'Nomade'}},opsReservations:[],opsReservationsView:()=>'',date:x=>x||'—',empty:x=>x,esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/a-bordo/briefs.js','utf8'),ctx);return ctx;
}
test('compact card excludes internal notes, finance and technical metadata',()=>{
 const a=app();const out=a.briefContent({name:'Guest',notes:'SECRET_INTERNAL_MAIL',crmBalance:999,guests:2,details:{country:'Brasil',airConditioning:'No',drinks:'Coca Zero'},passengers:[],brief:{revision:9}});
 assert.match(out,/Información del huésped/);assert.match(out,/Brasil/);assert.match(out,/Coca Zero/);assert.match(out,/Nombres pendientes/);assert.doesNotMatch(out,/SECRET_INTERNAL_MAIL|999|revision|Observaciones operativas/);
});
test('every recorded dietary restriction survives; dash is unknown, not no allergies',()=>{
 const a=app();const out=a.briefContent({details:{allergies:'Frutos secos'},legacyPreferences:{allergies:'Mariscos'},passengers:[{name:'Ana',avoid:'Maní',food:'Vegetariana'}]});
 for(const value of ['Frutos secos','Mariscos','Ana: Maní','Ana: Vegetariana'])assert.ok(out.includes(value));
 assert.match(a.briefContent({details:{allergies:'-'}}),/Pendiente de confirmar/);
 assert.doesNotMatch(a.briefContent({details:{allergies:'-'}}),/Sin restricciones|guest-alert/);
});
test('guest inputs are escaped and unknown passenger count is never zero',()=>{
 const out=app().briefContent({name:'<img src=x>',details:{transport:'<script>bad</script>'}});
 assert.match(out,/&lt;img/);assert.match(out,/&lt;script/);assert.doesNotMatch(out,/<script>|0 pasajeros/);assert.match(out,/Cantidad pendiente/);
});
test('crew only has versioned review; administration keeps draft controls inside a disclosure',()=>{
 const source={id:'r',name:'Guest',brief:{version:1,reviewedAt:null}};
 const crew=app();crew.opsReservations=[source];const out=crew.briefReservationsView();assert.match(out,/Ya la revisé · versión 1/);assert.doesNotMatch(out,/Guardar borrador|data-brief-action="publish"|brief-form/);
 const admin=app(true);admin.opsReservations=[{...source,brief:{version:0,draft:{country:'Brasil'},reviews:[]}}];const draft=admin.briefReservationsView();assert.match(draft,/Administración · editar y ver revisiones/);assert.match(draft,/name="country"/);assert.match(draft,/aprobación de Carlota/);assert.doesNotMatch(draft,/data-brief-action="publish"/);
});

test('captain only sees the guest card and review, even if old cached data includes contact',()=>{
 const a=app();a.role='capitan';a.opsReservations=[{id:'r',name:'Guest',phone:'PRIVATE_PHONE',email:'PRIVATE_EMAIL',collection:{amount:999},reports:[{amount:999}],brief:{version:1}}];
 const out=a.briefReservationsView();
 assert.match(out,/Información del huésped/);assert.match(out,/Ya la revisé · versión 1/);
 assert.doesNotMatch(out,/PRIVATE_PHONE|PRIVATE_EMAIL|Contacto del cliente|Administración|999|Guardar borrador/);
});

test('captain collection shows only approved amount and a separate receipt action',()=>{
 const a=app();a.role='capitan';
 const res={id:'r',details:{captainCollection:'collect'},captainBalance:{status:'known',amountUsd:700,reportedCount:0},brief:{version:2}};
 const out=a.briefPayment(res);assert.match(out,/USD 700,00/);assert.match(out,/data-brief-action="payment"/);
 assert.doesNotMatch(a.briefPayment({...res,brief:{sourceChanged:true}}),/data-brief-action/);
 assert.doesNotMatch(a.briefPayment({...res,captainBalance:{status:'incomplete',amountUsd:null}}),/USD 0|data-brief-action/);
 assert.match(a.briefPayment({...res,details:{captainCollection:'none'}}),/No tenés que cobrar/);
 assert.doesNotMatch(a.briefPayment({...res,captainBalance:{status:'known',amountUsd:700,reportedCount:1}}),/data-brief-action/);
 const paid=a.briefPayment({...res,captainPayment:{amountUsd:700,reportedBy:'Captain QA',reportedAt:'2026-01-01T12:00:00Z'}});
 assert.match(paid,/Pago recibido/);assert.doesNotMatch(paid,/data-brief-action/);
 a.role='chef';assert.equal(a.briefPayment(res),'');
});
