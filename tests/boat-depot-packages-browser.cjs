const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const enabled=process.env.STOCK_TEST_BROWSER==='1';
test('mobile dispatch and whole package signature records separate photos without quantity re-entry',{skip:!enabled&&'Set STOCK_TEST_BROWSER=1 with Chromium'},async()=>{
 const {chromium}=require('playwright-core');
 const binary=process.env.CHROMIUM_BIN || await (await import(require.resolve('@sparticuz/chromium'))).default.executablePath();
 const browser=await chromium.launch({executablePath:binary,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const sendPhoto='00000000-0000-4000-8000-000000000001', recPhoto='00000000-0000-4000-8000-000000000002';
  const sign='00000000-0000-4000-8000-000000000005';
  const id='00000000-0000-4000-8000-000000000003',lineId='00000000-0000-4000-8000-000000000004';
  const events=[];let pkg=null;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname, u=url.searchParams.get('role');
   if(p==='/'){
    const admin=u!=='chef';
    return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><script>
      const session={id:'${admin?'admin':'crew'}',admin:${admin}},role='${admin?'admin':'chef'}',boatId='nomade',adminStockSelection={scope:'nomade'};
      const state={boat:{name:'Nomadé'},products:[]},date=x=>x.slice(0,10),esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
      const depotNameKey=x=>x.toLowerCase(), uid=()=>crypto.randomUUID(), toast=()=>{};
      let stored; const draftRead=async()=>stored,editStoredDraft=async(k,fn)=>stored=fn(stored);
      const photo=async f=>f.name;
      const api=async(op,method,{data})=>({url:'/api/boat/photos?boat=nomade&id='+(data==='salida.png'?'${sendPhoto}':data==='llegada.png'?'${recPhoto}':'${sign}')});
      const opsAfterSave=async()=>document.querySelector('stockroom-packages').read();
      customElements.define('boat-admin-stock',class extends HTMLElement{
       constructor(){super();this.data={scope:"nomade",depotRevision:0,depotProducts:[{id:"beer",name:"Cerveza",current:60,unit:"unidad",location:"Seco"}],boats:[{id:"nomade",name:"Nomadé"}]};}
       connectedCallback(){this.read();} read(){this.innerHTML='<stockroom-packages data-admin-depot></stockroom-packages>';}
      });
      </script><script src="/depot-packages.js"></script>${admin?'<boat-admin-stock></boat-admin-stock>':'<stockroom-packages></stockroom-packages>'}`});
   }
   if(p.endsWith('/depot-packages.js'))return route.fulfill({contentType:'application/javascript; charset=utf-8',body:fs.readFileSync('public/a-bordo/depot-packages.js','utf8')});
   if(p.endsWith('/warehouse_package_list'))return route.fulfill({json:pkg?[pkg]:[]});
   if(p.endsWith('/warehouse_package_send')){
    const body=route.request().postDataJSON();events.push(body);
    pkg={id,boat_id:'nomade',sent_at:'2026-11-26T12:00:00Z',sent_photo:sendPhoto,status:'in_transit',
     items:[{id:lineId,name:'Cerveza',unit:'unidad',area:'gastronomia',packs:2,perPack:24,sent:48,received:0}],receipts:[]};
    return route.fulfill({json:{ok:true}});
   }
   if(p.endsWith('/warehouse_package_receive')){
    const body=route.request().postDataJSON();events.push(body);pkg.status='received';pkg.items[0].received=48;
    pkg.receipts=[{photo:recPhoto,signature:sign,verified:true,signedBy:'Chef QA',at:'2026-11-26T12:10:00Z'}];
    return route.fulfill({json:{ok:true}});
   }
   return route.abort();
  });
  await page.goto('https://fixture.test/?role=admin');
  await page.getByText('Preparar paquete desde Tierra',{exact:true}).click();
  await page.locator('[name=productId]').selectOption('beer');
  await page.locator('[name=packs]').fill('2');await page.locator('[name=perPack]').fill('24');
  await page.getByText('Total a despachar: 48 unidad').waitFor();
  assert.equal(await page.locator('[data-package-send] [name=photo]').getAttribute('required'),'');
  await page.locator('[data-package-send] [name=photo]').setInputFiles({name:'salida.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
  await page.getByRole('button',{name:'Confirmar despacho'}).click();
  await page.getByRole('heading',{name:'En camino'}).waitFor();
  await page.goto('https://fixture.test/?role=chef');
  assert.equal(await page.getByText('Preparar paquete desde Tierra').count(),0);
  assert.match(await page.getByRole('link',{name:'Foto del despacho'}).getAttribute('href'),new RegExp(sendPhoto));
  await page.getByText('Recibir paquete',{exact:true}).click();
  assert.equal(await page.locator('[name=quantity]').count(),0);
  await page.locator('[name=photo]').setInputFiles({name:'llegada.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
  await page.locator('[name=verified]').check();
  await page.getByRole('button',{name:'Firmar y recibir todo'}).click();
  await page.getByText(/firmá antes/).waitFor();
  const canvas=page.locator('[data-signature]');await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();
  await page.mouse.move(b.x+30,b.y+20);await page.mouse.down();await page.mouse.move(b.x+90,b.y+45,{steps:8});await page.mouse.up();
  await page.getByRole('button',{name:'Firmar y recibir todo'}).click();
  await page.getByRole('heading',{name:'Recibido y firmado'}).waitFor();
  assert.match(await page.getByRole('link',{name:'Foto de recepción'}).getAttribute('href'),new RegExp(recPhoto));
  assert.match(await page.getByRole('link',{name:'Ver firma'}).getAttribute('href'),new RegExp(sign));
  assert.equal(events.length,2);assert.equal(events[0].photo,sendPhoto);assert.equal(events[1].photo,recPhoto);
  assert.deepEqual(events[0].items,[{productId:'beer',packs:2,perPack:24}]);
  assert.equal(events[1].items,undefined);assert.equal(events[1].signature,sign);assert.equal(events[1].verified,true);
 }finally{await browser.close();}
});
