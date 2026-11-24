const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const fixtureRoot=path.resolve('public/a-bordo');
const origin='http://127.0.0.1:5199';
const id='10000000-0000-4000-8000-000000000001';
(async()=>{
 const browser=await chromium.launch();
 try{
  for(const role of ['administrador','capitan','chef']){
   const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   const page=await ctx.newPage();const live=[],faults=[];
   page.on('pageerror',e=>faults.push(e.message));
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort();
    if(u.pathname.startsWith('/api/')){live.push(u.pathname);return route.fulfill({status:403,json:{error:'Backend disabled'}});}
    if(!u.pathname.startsWith('/a-bordo/'))return route.fulfill({status:404,body:''});
    const file=path.join(fixtureRoot,path.basename(u.pathname));
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({path:file});
   });
   await page.goto(origin+'/a-bordo/index.html?qa-role='+role);
   await page.getByText(/Prueba aislada · datos ficticios/).waitFor();
   const nav=page.getByRole('navigation',{name:'Secciones del barco'});
   await nav.waitFor();
   const agenda=nav.getByRole('button',{name:/^Agenda del mes/});
   if(role!=='chef'){
    await agenda.click();
    const pick=page.locator('.agenda-list button[data-agenda-open="'+id+'"]').first();
    await pick.click();
    if(role==='administrador'){
     const form=page.locator('.brief-form');assert.ok(await form.isVisible());
     await form.locator('[name=transport]').fill('Traslado ficticio verificado');
     await form.getByRole('button',{name:'Guardar borrador'}).click();
     await page.locator('.brief-form[data-revision="6"]').waitFor();
     assert.equal(await page.locator('.brief-form [name=transport]').inputValue(),'Traslado ficticio verificado');
     await page.getByRole('button',{name:'Volver a la agenda del mes'}).click();await pick.waitFor();
    }else{
     await page.getByText('Ficha operativa de la reserva',{exact:true}).waitFor();
     await page.getByText(/Modalidad: Compartido. Traslado: Confirmado/).waitFor();
     await page.getByText(/Recogida de traslado \(ida\):/).waitFor();
     assert.equal(await page.locator('.brief-form, [data-brief-action=payment]').count(),0);
    }
   }else{
    assert.equal(await agenda.count(),0);
    assert.equal(await page.getByText('Ficha operativa de la reserva',{exact:true}).count(),0);
   }
   assert.deepEqual(live,[]);assert.deepEqual(faults,[]);await ctx.close();
  }
  console.log('PASS Chromium mobile /a-bordo: Administración guarda borrador ficticio; capitán lee; chef sin acceso. Ninguna API real.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
