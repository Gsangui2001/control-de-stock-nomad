// Playwright CLI run-code --filename tests/boat-briefs-browser.js
// Isolated UI fixture. Database authorization is tested separately in SQL.
// Serve public/ on 127.0.0.1:5199 first. Every name and amount is invented.
async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const boat='6bf8e2dceb8157d62159ae7bd29967fd',id='10000000-0000-4000-8000-000000000001';
 let currentRole='administrador',draft={},published=null,revision=0,version=0,reviewed=false,paid=false,paymentCalls=0;
 const source={id,name:'Familia de prueba',primaryAge:41,phone:'+0000000',email:'fixture@example.invalid',start:'2026-11-10',end:'2026-11-14',guests:3,status:'confirmed',notes:'Datos ficticios para verificar la interfaz.',
  passengers:[{name:'Titular de prueba',age:41,primary:true,food:'Vegetariano',avoid:'Maní',requests:'Sin picante'},{name:'Acompañante de prueba',age:9,primary:false}],interests:['snorkeling']};
 const agenda=()=>[{id,start:source.start,end:source.end,name:source.name,guests:3,primaryAge:41,status:'confirmed',briefVersion:version,reviewedAt:reviewed?'2026-10-23T20:30:00Z':null,toCollectUsd:paid?null:2016,paid},
  {id:'10000000-0000-4000-8000-000000000002',start:'2026-11-20',end:'2026-11-24',name:'Otra familia de prueba',guests:2,primaryAge:null,status:'confirmed',briefVersion:0,reviewedAt:null,toCollectUsd:null,paid:false}];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),op=url.pathname.split('/').pop();let result={};
  const body=route.request().method()==='GET'?{}:route.request().postDataJSON();
  if(op==='session')result={user:{id:'qa-'+currentRole,name:'Usuario de prueba',admin:currentRole==='administrador'}};
  else if(op==='boats')result=[{id:boat,name:'Nomade',role:currentRole}];
  else if(op==='state')result={revision:0,role:currentRole,state:{schema:1,boat:{name:'Nomade',currency:'USD',equipment:[]},products:[],tasks:[],logs:[],purchases:[],movements:[],cameras:[],manual:{content:''}}};
  else if(op==='activity')result=[];
  else if(op==='overview')result={requests:[],transfers:[],fleet:[],notifications:[],members:[],pushPublicKey:''};
  else if(op==='reservations'){
   const brief={version,revision,draft,sourceHash:'a'.repeat(64),publishedAt:version?'2026-10-23T20:00:00Z':null,reviewedAt:reviewed?'2026-10-23T20:30:00Z':null,reviews:[{name:'Capitán de prueba',role:'capitan',reviewedAt:reviewed?'2026-10-23T20:30:00Z':null}]};
   if(currentRole==='administrador')result=[{...source,brief,preferences:{},reports:[]}];
   else if(published){
    const {phone,email,notes,...card}=source;
    result=[{...card,details:{...published,captainCollection:'collect'},brief:{version,reviewedAt:brief.reviewedAt,publishedAt:brief.publishedAt},
     captainBalance:{status:'known',currency:'USD',amountUsd:paid?0:2016,reportedCount:0},
     captainPayment:paid?{status:'cleared',amountUsd:2016,balanceUsd:0,reportedBy:'Capitán de prueba',reportedAt:'2026-11-12T12:00:00Z'}:null}];
   }else result=[];
  }else if(op==='agenda'){if(!['capitan','encargado','administrador'].includes(currentRole))throw Error('Agenda requested by '+currentRole);result=agenda();}
  else if(op==='brief_save'){if(body.details.allergies!=='Evitar maní y frutos secos')throw Error('Draft payload mismatch');draft=body.details;revision++;result={ok:true};}
  else if(op==='brief_review'){if(body.version!==version)throw Error('Wrong review version');reviewed=true;result={ok:true};}
  else if(op==='brief_payment'){if(body.version!==version||body.id!==id||!body.key)throw Error('Payment payload mismatch');paymentCalls++;paid=true;result={ok:true,payment:{status:'cleared',amountUsd:2016,balanceUsd:0,reportedBy:'Capitán de prueba',reportedAt:'2026-11-12T12:00:00Z'}};}
  else if(op==='external_templates')result=[{...source,id:'20000000-0000-4000-8000-000000000002',boatName:'Otro barco',captainName:'Capitán de prueba'}];
  else throw Error('Unexpected fixture API: '+url.pathname);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const noOverflow=async label=>{if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(label+' mobile overflow');};
 await page.setViewportSize({width:390,height:844});
 // Administration: draft only. Approval and publication happen in the CRM.
 await page.goto('http://127.0.0.1:5199/a-bordo/index.html?boat='+boat+'&reservation='+id);
 await page.getByText('Todavía no está publicada para la tripulación.').waitFor();
 if(await page.getByRole('button',{name:'Publicar para la tripulación'}).count())throw Error('App still offers publication outside the CRM');
 await page.getByText('Administración · editar y ver revisiones',{exact:true}).click();
 await page.getByText('Completar o corregir la ficha',{exact:true}).click();
 await page.getByLabel('Alergias / alimentos a evitar',{exact:true}).fill('Evitar maní y frutos secos');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await page.getByText('Evitar maní y frutos secos',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Plantillas para otros capitanes'}).click();
 await page.getByText('Otro barco',{exact:false}).first().click();
 const template=await page.locator('[data-template]').inputValue();
 if(!template.includes('FICHA DEL VIAJE · Otro barco')||!template.includes('Maní'))throw Error('Template missing operational fields');
 if(await page.getByText('A pagar',{exact:true}).count())throw Error('Administration sees the captain amount');
 await noOverflow('Admin');
 await page.screenshot({path:'output/playwright/briefs-admin-mobile.png',fullPage:true});
 // The CRM approves and publishes the saved draft.
 published={...draft,country:'BRASIL',airConditioning:'no',transport:'Llega con Judy',disembarkationTime:'Late check out',drinks:'coca zero y jugo de naranja'};version=1;
 // Captain: card in the owner's format, monthly agenda and the "yes, I was paid" answer.
 currentRole='capitan';await page.goto('http://127.0.0.1:5199/a-bordo/index.html?boat='+boat);
 await page.getByRole('button',{name:'Agenda del mes',exact:true}).first().click();
 await page.locator('.agenda-nav h3').waitFor();
 // The agenda opens on the current month in Panama; move to the fixture month.
 for(let i=0;i<36&&(await page.locator('.agenda-nav h3').innerText())!=='Noviembre 2026';i++){
  const ahead=(await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Panama'}).slice(0,7)))<'2026-11';
  await page.getByRole('button',{name:ahead?'Mes siguiente':'Mes anterior'}).click();
 }
 await page.getByText('Cobrar USD 2.016,00',{exact:true}).waitFor();
 await page.getByText('Ficha en preparación',{exact:true}).waitFor();
 await noOverflow('Agenda');
 await page.screenshot({path:'output/playwright/briefs-agenda-mobile.png',fullPage:true});
 await page.getByRole('button',{name:/Familia de prueba \(41\)/}).click();
 await page.getByText('10/11 - 14/11 LATE CHECK OUT',{exact:true}).waitFor();
 await page.getByText('Acompañante de prueba (9)',{exact:true}).waitFor();
 if(await page.getByText(/fixture@example|\+0000000|Datos ficticios/).count())throw Error('Captain sees contact or internal notes');
 let confirmation='';page.once('dialog',d=>{confirmation=d.message();d.accept();});
 await page.getByRole('button',{name:'Sí, me pagaron USD 2.016,00',exact:true}).click();
 await page.getByText('Registrado: pagado. La venta quedó saldada en el CRM.').waitFor();
 if(!confirmation.includes('USD 2.016,00 completos'))throw Error('Unexpected confirmation: '+confirmation);
 if(paymentCalls!==1)throw Error('Payment count mismatch');
 await page.getByRole('button',{name:'Ya la revisé · versión 1',exact:true}).click();
 await page.getByText('Revisaste la versión 1',{exact:false}).waitFor();
 await noOverflow('Captain');
 await page.screenshot({path:'output/playwright/briefs-captain-mobile.png',fullPage:true});
 // Crew without amounts or agenda.
 currentRole='chef';reviewed=false;await page.goto('http://127.0.0.1:5199/a-bordo/index.html?boat='+boat+'&reservation='+id);
 await page.getByRole('button',{name:'Ya la revisé · versión 1',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'Plantillas para otros capitanes'}).count())throw Error('Crew sees admin templates');
 if(await page.getByRole('button',{name:'Agenda del mes'}).count())throw Error('Chef sees the captain agenda');
 if(await page.getByText(/USD|A pagar/).count())throw Error('Chef sees amounts');
 await noOverflow('Crew');
 if(errors.length)throw Error(errors.join('; '));
 await page.evaluate(()=>document.body.dataset.briefQa='passed');
 console.log('PASS UI fixture: admin draft, templates, captain card format, agenda, payment yes, review, crew without amounts, no page errors.');
}
