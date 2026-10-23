// Playwright CLI run-code --filename tests/boat-briefs-browser.js
// Isolated UI fixture. Database authorization is tested separately in SQL.
async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const boat='6bf8e2dceb8157d62159ae7bd29967fd',id='10000000-0000-4000-8000-000000000001';
 let currentRole='administrador',draft={},published=null,revision=0,version=0,reviewed=false,publishCalls=0;
 const source={id,name:'Familia de prueba',phone:'+0000000',email:'fixture@example.invalid',start:'2026-11-10',end:'2026-11-14',guests:4,status:'confirmed',notes:'Datos ficticios para verificar la interfaz.',passengers:[{name:'Pasajero de prueba',food:'Vegetariano',avoid:'Maní',requests:'Sin picante'}],interests:['snorkeling']};
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),op=url.pathname.split('/').pop();let result={};
  const body=route.request().method()==='GET'?{}:route.request().postDataJSON();
  if(op==='session')result={user:{id:'qa-'+currentRole,name:'Usuario de prueba',admin:currentRole==='administrador'}};
  else if(op==='boats')result=[{id:boat,name:'Nomade',role:currentRole}];
  else if(op==='state')result={revision:0,role:currentRole,state:{schema:1,boat:{name:'Nomade',currency:'USD',equipment:[]},products:[],tasks:[],logs:[],purchases:[],movements:[],cameras:[],manual:{content:''}}};
  else if(op==='activity')result=[];
  else if(op==='overview')result={requests:[],transfers:[],fleet:[],notifications:[],members:[],pushPublicKey:''};
  else if(op==='reservations'){
   const brief={version,revision,draft,sourceHash:'a'.repeat(64),publishedAt:version?'2026-10-23T20:00:00Z':null,reviewedAt:reviewed?'2026-10-23T20:30:00Z':null,reviews:[{name:'Chef de prueba',role:'chef',reviewedAt:reviewed?'2026-10-23T20:30:00Z':null}]};
   result=currentRole==='administrador'?[{...source,brief,preferences:{},reports:[]}]:published?[{...source,details:published,brief:{version,reviewedAt:brief.reviewedAt,publishedAt:brief.publishedAt}}]:[];
  if(currentRole==='chef')for(const r of result){delete r.phone;delete r.email;}
  }else if(op==='brief_save'){if(body.details.allergies!=='Evitar maní y frutos secos')throw Error('Draft payload mismatch');draft=body.details;revision++;result={ok:true};}
  else if(op==='brief_publish'){publishCalls++;published={...draft};version++;revision++;reviewed=false;result={ok:true,version};}
  else if(op==='brief_review'){if(body.version!==version)throw Error('Wrong review version');reviewed=true;result={ok:true};}
  else if(op==='external_templates')result=[{...source,id:'20000000-0000-4000-8000-000000000002',boatName:'Otro barco',captainName:'Capitán de prueba'}];
  else throw Error('Unexpected fixture API: '+url.pathname);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:5199/a-bordo/index.html?boat='+boat+'&reservation='+id);
 await page.getByText('Todavía no está publicada para la tripulación.').waitFor();
 await page.getByText('Completar o corregir la ficha',{exact:true}).click();
 await page.getByLabel('Alergias y restricciones confirmadas',{exact:true}).fill('Evitar maní y frutos secos');
 await page.getByRole('button',{name:'Publicar para la tripulación',exact:true}).click();
 if(publishCalls!==0)throw Error('Unsaved draft was published');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await page.getByText('Evitar maní y frutos secos',{exact:false}).first().waitFor();
 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Publicar para la tripulación',exact:true}).click();
 await page.getByRole('heading',{name:'Revisión de la versión 1',exact:true}).waitFor();
 if(publishCalls!==1)throw Error('Publication count mismatch');
 await page.getByRole('button',{name:'Plantillas para otros capitanes'}).click();
 await page.getByText('Otro barco',{exact:false}).first().click();
 const template=await page.locator('[data-template]').inputValue();
 if(!template.includes('FICHA DEL VIAJE · Otro barco')||!template.includes('Maní'))throw Error('Template missing operational fields');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Admin mobile overflow');
 await page.screenshot({path:'output/playwright/briefs-admin-mobile.png',fullPage:true});
 currentRole='chef';await page.reload();
 await page.getByRole('button',{name:'Revisé la ficha · versión 1',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'Plantillas para otros capitanes'}).count())throw Error('Crew sees admin templates');
 await page.getByRole('button',{name:'Revisé la ficha · versión 1',exact:true}).click();
 await page.getByText('Revisaste la versión 1',{exact:false}).waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Crew mobile overflow');
 await page.screenshot({path:'output/playwright/briefs-crew-mobile.png',fullPage:true});
 if(errors.length)throw Error(errors.join('; '));
 await page.evaluate(()=>document.body.dataset.briefQa='passed');
 console.log('PASS UI fixture: mobile draft, unsaved guard, publish, captain template, crew review, role controls, no page errors.');
}
