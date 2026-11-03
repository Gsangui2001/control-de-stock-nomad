const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Every name and amount below is invented for the fixture.
function app(admin=false){
 const ctx={document:{addEventListener(){}},URLSearchParams,location:{search:''},session:{admin},role:'chef',state:{boat:{name:'Nomade'}},boatId:'boat-qa',dayPage:'ops-agenda',opsReservations:[],opsReservationsView:()=>'',render(){},opsFetch:async()=>[],date:x=>x||'—',empty:x=>x,esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/a-bordo/briefs.js','utf8'),ctx);return ctx;
}
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
test('compact card excludes internal notes, finance and technical metadata',()=>{
 const a=app();const out=a.briefContent({name:'Guest',notes:'SECRET_INTERNAL_MAIL',crmBalance:999,guests:2,details:{country:'Brasil',airConditioning:'No',drinks:'Coca Zero'},passengers:[],brief:{revision:9}});
 assert.match(out,/Información del huésped/);assert.match(out,/Brasil/);assert.match(out,/Coca Zero/);assert.match(out,/1 acompañante · nombres pendientes/);assert.doesNotMatch(out,/SECRET_INTERNAL_MAIL|999|revision|Observaciones operativas/);
});
test('card follows the owner reference: order, titles, dates, ages and companions',()=>{
 const a=app();a.role='capitan';
 const out=a.briefContent({id:'r',name:'Lucía Ferreyra',primaryAge:38,start:'2026-10-04',end:'2026-10-07',guests:3,
  details:{country:'BRASIL',airConditioning:'no',transport:'Llega con Judy',disembarkationTime:'Late check out 14 h',drinks:'coca zero y jugo de naranja',activities:'cultura, conocer islas, hacer snorkel'},
  passengers:[{name:'LUCIA  FERREYRA',age:38},{name:'Tomás Ferreyra',age:12},{name:'Ana Paz',age:null}],brief:{version:1}});
 const flat=text(out);
 assert.match(flat,/Fecha del charter 04\/10 - 07\/10 LATE CHECK OUT/);
 assert.match(flat,/Nombre del cliente principal Lucía Ferreyra \(38\)/);
 assert.match(flat,/Acompañantes Tomás Ferreyra \(12\) · Ana Paz /);
 assert.doesNotMatch(flat,/Ana Paz \(|LUCIA/);
 assert.match(flat,/País de procedencia BRASIL/);
 const order=['Información del huésped','Fecha del charter','Nombre del cliente principal','Acompañantes','País de procedencia','Aire acondicionado','Llegada','Salida','Información de comidas','A evitar','Prefieren','Dieta específica','A pagar','Experiencia'];
 const positions=order.map(label=>flat.indexOf(label));
 assert.ok(positions.every(p=>p>=0),'missing label: '+order[positions.indexOf(-1)]);
 assert.deepEqual([...positions].sort((x,y)=>x-y),positions);
 assert.match(flat,/Prefieren coca zero y jugo de naranja/);
});
test('missing age, alone, unknown count and no late checkout degrade without inventing',()=>{
 const a=app();
 const alone=text(a.briefContent({name:'Pedro Gil',start:'2026-11-02',end:'2026-11-05',guests:1,details:{disembarkationTime:'10:00'},passengers:[]}));
 assert.match(alone,/Nombre del cliente principal Pedro Gil Acompañantes - /);assert.match(alone,/02\/11 - 05\/11 Nombre/);assert.doesNotMatch(alone,/LATE|\(\)/);
 const unknown=text(a.briefContent({name:'Pedro Gil',passengers:[]}));
 assert.match(unknown,/Fecha del charter Pendiente de confirmar/);assert.match(unknown,/Acompañantes Pendiente de confirmar/);
 const onlyMain=text(a.briefContent({name:'Pedro Gil',passengers:[{name:'pedro gil',age:'41'}]}));
 assert.match(onlyMain,/Acompañantes - /);
 assert.match(text(a.briefContent({name:'X',start:'2026-11-02',end:'2026-11-05',details:{disembarkationTime:'Salida tardía a las 15'}})),/02\/11 - 05\/11 LATE CHECK OUT/);
});
test('primary flag separates the principal even when the contact name differs from the passport',()=>{
 const a=app();
 const flat=text(a.briefContent({name:'Lu Ferreyra',primaryAge:38,guests:3,passengers:[{name:'Lucía Ferreyra Souza',age:38,primary:true},{name:'Tomás Ferreyra',age:12,primary:false},{name:'Lu Ferreyra',age:40,primary:false}]}));
 assert.match(flat,/Nombre del cliente principal Lu Ferreyra \(38\)/);
 // With the flag, the name comparison is not used: a companion sharing the contact name stays a companion.
 assert.match(flat,/Acompañantes Tomás Ferreyra \(12\) · Lu Ferreyra \(40\) /);assert.doesNotMatch(flat,/Souza/);
 assert.match(text(a.briefContent({name:'Lu',passengers:[{name:'Lucía',age:51,primary:true}]})),/Lu \(51\) Acompañantes - /);
});
test('every recorded dietary restriction survives; dash is unknown, not no allergies',()=>{
 const a=app();const out=a.briefContent({details:{allergies:'Frutos secos'},legacyPreferences:{allergies:'Mariscos'},passengers:[{name:'Ana',avoid:'Maní',food:'Vegetariana'}]});
 for(const value of ['Frutos secos','Mariscos','Ana: Maní','Ana: Vegetariana'])assert.ok(out.includes(value));
 assert.match(a.briefContent({details:{allergies:'-'}}),/Pendiente de confirmar/);
 assert.doesNotMatch(a.briefContent({details:{allergies:'-'}}),/Sin restricciones|guest-alert/);
});
test('guest inputs are escaped and unknown passenger count is never zero',()=>{
 const out=app().briefContent({name:'<img src=x>',details:{transport:'<script>bad</script>'},passengers:[{name:'<b>x</b>',age:3}]});
 assert.match(out,/&lt;img/);assert.match(out,/&lt;script/);assert.match(out,/&lt;b&gt;x/);assert.doesNotMatch(out,/<script>|<b>|0 pasajeros/);
});
test('crew only has versioned review; administration keeps draft controls inside a disclosure',()=>{
 const source={id:'r',name:'Guest',brief:{version:1,reviewedAt:null}};
 const crew=app();crew.opsReservations=[source];const out=crew.briefReservationsView();assert.match(out,/Ya la revisé · versión 1/);assert.doesNotMatch(out,/Guardar borrador|data-brief-action="publish"|brief-form|A pagar/);
 const admin=app(true);admin.opsReservations=[{...source,brief:{version:0,draft:{country:'Brasil'},reviews:[]}}];const draft=admin.briefReservationsView();assert.match(draft,/Administración · editar y ver revisiones/);assert.match(draft,/name="country"/);assert.match(draft,/aprobación de Carlota/);assert.doesNotMatch(draft,/data-brief-action="publish"|A pagar/);
});

test('captain only sees the guest card and review, even if old cached data includes contact',()=>{
 const a=app();a.role='capitan';a.opsReservations=[{id:'r',name:'Guest',phone:'PRIVATE_PHONE',email:'PRIVATE_EMAIL',passengers:[{name:'Otro',passport:'PRIVATE_PASSPORT'}],collection:{amount:999},reports:[{amount:999}],brief:{version:1}}];
 const out=a.briefReservationsView();
 assert.match(out,/Información del huésped/);assert.match(out,/Ya la revisé · versión 1/);assert.match(text(out),/A pagar por confirmar con Carlota/);
 assert.doesNotMatch(out,/PRIVATE_PHONE|PRIVATE_EMAIL|PRIVATE_PASSPORT|Contacto del cliente|Administración|999|Guardar borrador/);
});

test('captain "A pagar" states: none, paid, known balance with a yes button, unknown',()=>{
 const a=app();a.role='capitan';
 const res={id:'r',details:{captainCollection:'collect'},captainBalance:{status:'known',currency:'USD',amountUsd:2016,reportedCount:0},brief:{version:2}};
 const due=a.briefPayment(res);
 assert.match(text(due),/A pagar USD 2\.016,00/);assert.match(due,/data-brief-action="payment"/);assert.match(due,/Sí, me pagaron USD 2\.016,00/);
 // Collection mode other than 'none' (even if not stated) still lets the captain answer.
 assert.match(a.briefPayment({...res,details:{}}),/data-brief-action="payment"/);
 assert.doesNotMatch(a.briefPayment({...res,brief:{version:2,sourceChanged:true}}),/data-brief-action/);
 assert.doesNotMatch(a.briefPayment({...res,brief:{version:0}}),/data-brief-action/);
 const unknown=a.briefPayment({...res,captainBalance:{status:'incomplete',amountUsd:null}});
 assert.match(text(unknown),/A pagar por confirmar con Carlota/);assert.doesNotMatch(unknown,/USD 0|data-brief-action/);
 assert.match(text(a.briefPayment({id:'r'})),/A pagar por confirmar con Carlota/);
 assert.match(text(a.briefPayment({...res,details:{captainCollection:'none'}})),/A pagar no cobra a bordo/);
 assert.match(text(a.briefPayment({...res,captainBalance:{status:'known',amountUsd:0,reportedCount:0}})),/A pagar pagado/);
 assert.doesNotMatch(a.briefPayment({...res,captainBalance:{status:'known',amountUsd:2016,reportedCount:1}}),/data-brief-action/);
 const reported=a.briefPayment({...res,captainPayment:{status:'reported',amountUsd:2016,reportedBy:'Capitán QA',reportedAt:'2026-01-01T12:00:00Z'}});
 assert.match(reported,/Pago informado · pendiente de registro/);assert.doesNotMatch(reported,/data-brief-action|Carlota/);
 a.role='chef';assert.equal(a.briefPayment(res),'');
 a.role='encargado';assert.equal(a.briefPayment(res),'');
});

test('cleared payment is paid only when nothing is left',()=>{
 const a=app();a.role='capitan';const base={id:'r',captainPayment:{amountUsd:700,status:'cleared',balanceUsd:0,reportedBy:'Capitán QA',reportedAt:'2026-01-01T12:00:00Z'}};
 const paid=text(a.briefPayment(base));
 assert.match(paid,/A pagar pagado/);assert.match(paid,/Cobrado USD 700,00 · Capitán QA/);assert.doesNotMatch(paid,/verificado por Carlota|pendiente de Carlota/);
 assert.match(text(a.briefPayment({...base,captainPayment:{...base.captainPayment,balanceUsd:null}})),/A pagar pagado/);
 const partial=text(a.briefPayment({...base,captainPayment:{...base.captainPayment,balanceUsd:100}}));
 assert.doesNotMatch(partial,/A pagar pagado/);assert.match(partial,/USD 100,00 pendiente/);
});

function agendaApp(rows,roleName='capitan'){
 const a=app(roleName==='admin');a.role=roleName==='admin'?'':roleName;
 vm.runInContext(`briefAgenda=${JSON.stringify(rows)};briefAgendaBoat=boatId;briefAgendaMonth='2026-11';`,a);
 return a;
}
const agendaRows=[
 {id:'b',start:'2026-11-20',end:'2026-11-24',name:'Clara Núñez',guests:2,primaryAge:null,status:'confirmed',briefVersion:0,reviewedAt:null,toCollectUsd:null,paid:false},
 {id:'a',start:'2026-10-30',end:'2026-11-02',name:'Pedro Gil',guests:4,primaryAge:45,status:'in_progress',briefVersion:2,reviewedAt:'2026-10-29T10:00:00Z',toCollectUsd:1500,paid:false},
 {id:'c',start:'2026-11-10',end:'2026-11-12',name:'Ana Paz',guests:1,primaryAge:30,status:'completed',briefVersion:1,reviewedAt:null,toCollectUsd:null,paid:true},
 {id:'d',start:'2026-12-03',end:'2026-12-06',name:'Fuera de mes',guests:2,status:'confirmed',briefVersion:1}
];
test('agenda groups by month, sorts by date and shows the captain what to collect',()=>{
 const a=agendaApp(agendaRows);const out=a.briefAgendaView(),flat=text(out);
 assert.match(flat,/Noviembre 2026/);assert.doesNotMatch(flat,/Fuera de mes/);
 assert.ok(flat.indexOf('Pedro Gil')<flat.indexOf('Ana Paz')&&flat.indexOf('Ana Paz')<flat.indexOf('Clara Núñez'));
 assert.match(flat,/30\/10 - 02\/11 Pedro Gil \(45\) 4 pasajeros Navegando Ficha enviada Revisada Cobrar USD 1\.500,00/);
 assert.match(flat,/Ana Paz \(30\) 1 pasajero Terminado Ficha enviada Pagado/);
 assert.match(flat,/Clara Núñez 2 pasajeros Ficha en preparación/);assert.doesNotMatch(flat,/Clara Núñez \(/);
 assert.match(out,/data-agenda-open="a"/);assert.match(out,/data-agenda-open="c"/);assert.doesNotMatch(out,/data-agenda-open="b"/);
 assert.match(out,/data-agenda-month="2026-10"/);assert.match(out,/data-agenda-month="2026-12"/);
});
test('agenda hides amounts from roles other than captain and handles an empty month',()=>{
 const enc=agendaApp(agendaRows,'encargado');const out=text(enc.briefAgendaView());
 assert.match(out,/Pedro Gil/);assert.doesNotMatch(out,/Cobrar|Pagado|USD/);
 const admin=agendaApp(agendaRows,'admin');assert.doesNotMatch(text(admin.briefAgendaView()),/Cobrar|USD/);
 const empty=agendaApp([]);assert.match(empty.briefAgendaView(),/No hay charters confirmados este mes\./);
 vm.runInContext(`briefAgendaMonth='2027-01';`,empty);assert.match(text(empty.briefAgendaView()),/Enero 2027/);
});
test('agenda entry is only for captain, manager or admin of the Nomade',()=>{
 const a=app();a.role='chef';assert.equal(a.briefAgendaAllowed(),false);assert.match(a.briefAgendaView(),/disponible para el capitán/);
 a.role='capitan';assert.equal(a.briefAgendaAllowed(),true);
 a.state={boat:{name:'Otro barco'}};assert.equal(a.briefAgendaAllowed(),false);
 const crew=app();crew.role='capitan';crew.opsReservations=[{id:'r',name:'Guest',brief:{version:1}}];assert.match(crew.briefReservationsView(),/data-day="ops-agenda"/);
 crew.role='marinero';assert.doesNotMatch(crew.briefReservationsView(),/data-day="ops-agenda"/);
});
test('agenda loads once through the read operation and keeps unknown data unknown',async()=>{
 const a=app();a.role='capitan';const calls=[];
 a.opsFetch=async op=>{calls.push(op);return [{id:'x',start:'2026-11-05',end:'2026-11-08',name:'Sin Datos',guests:null,primaryAge:'n/a',status:'confirmed',briefVersion:1,toCollectUsd:null,paid:false}];};
 vm.runInContext(`briefAgendaMonth='2026-11';`,a);
 assert.match(a.briefAgendaView(),/Cargando agenda/);assert.match(a.briefAgendaView(),/Cargando agenda/);
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['agenda']);
 const flat=text(a.briefAgendaView());assert.match(flat,/Sin Datos Pasajeros por confirmar Ficha enviada/);assert.doesNotMatch(flat,/Cobrar|Pagado|\(n\/a\)|0 pasajeros/);
});
