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
