// Isolated browser with OCR and server fixtures, no live requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const hasBrowser=process.env.STOCK_TEST_BROWSER==='1';
test('photo picker auto-reads, asks once, and recovers the same write on reload',{skip:!hasBrowser&&'Set STOCK_TEST_BROWSER=1 with playwright-core and Chromium installed'},async()=>{
 const {chromium}=require('playwright-core');
 const binary=process.env.CHROMIUM_BIN || await (await import(require.resolve('@sparticuz/chromium'))).default.executablePath();
 const browser=await chromium.launch({executablePath:binary,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let reads=0, writes=[], count=0;
  const fixture=`<!doctype html><script>
  const session={admin:true,id:'qa'}, esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const uid=()=>crypto.randomUUID(), photo=async()=> 'fake-photo', toast=()=>{};
  const intakeOcr=async()=> 'Arroz 7';
  async function draftRead(k){return JSON.parse(localStorage.getItem(k)||'null');}
  async function editStoredDraft(k,fn){const r=fn(await draftRead(k));localStorage.setItem(k,JSON.stringify(r));return r;}
  customElements.define('boat-admin-stock',class extends HTMLElement {
    constructor(){super();this.data={products:[{id:'a',name:'Arroz',unit:'kg',location:'Seco',area:'gastronomia'}]};}
    connectedCallback(){this.read();}
    read(){this.innerHTML='<depot-photo-count data-revision="0"></depot-photo-count>';}
  });
  </script><script src="/depot-photo.js"></script><boat-admin-stock></boat-admin-stock>`;
  const seen=new Set();
  await page.route('**/*',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html',body:fixture});
   if(path==='/depot-photo.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('public/a-bordo/depot-photo.js','utf8')});
   if(path.endsWith('/warehouse_photo_read')){
    reads++;assert.deepEqual(route.request().postDataJSON(),{scope:'depot',text:'Arroz 7'});
    return route.fulfill({json:{items:[{name:'Arroz',quantity:7,unit:'',location:''}]}});
   }
   if(path.endsWith('/warehouse_photo_count')){
    const body=route.request().postDataJSON();writes.push(body);
    if(!seen.has(body.key)){seen.add(body.key);count++;return route.abort('failed');}
    return route.fulfill({json:{ok:true,rows:1,revision:1}});
   }
   return route.abort();
  });
  await page.goto('https://fixture.test/');
  assert.equal(await page.getByRole('button',{name:'Sacar foto'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Elegir foto'}).count(),1);
  await page.locator('[data-source=gallery]').setInputFiles({name:'conteo.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
  await page.getByText(/^7 kg/).waitFor();
  assert.equal(reads,1);assert.equal(writes.length,0);
  await page.getByRole('button',{name:'Confirmar y actualizar Stock Tierra'}).click();
  await page.getByRole('button',{name:'Verificar guardado pendiente'}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Verificar guardado pendiente'}).click();
  await page.getByRole('button',{name:'Sacar foto'}).waitFor();
  assert.equal(reads,1);assert.equal(writes.length,2);assert.equal(count,1);
  assert.deepEqual(writes[0],writes[1]);
  assert.deepEqual(writes[0].items,[{name:'Arroz',unit:'kg',location:'Seco',area:'gastronomia',quantity:7,productId:'a'}]);
 }finally{await browser.close();}
});
