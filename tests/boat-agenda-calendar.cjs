// Run with the project's browser QA settings (PLAYWRIGHT_MODULE and CHROMIUM_BIN).
// Nothing leaves this context: both the application and its boat API are local fixtures.
// 2026-11-24: the CRM adds the Nomade calendar bookings that do not come from a sale (agency seats,
// Emili's sales, direct bookings without a sale). Open a read-only calendar detail, not a CRM card.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const assets = path.resolve(__dirname, '../public/a-bordo');
const boat = 'b'.repeat(32);
const month = new Date().toLocaleDateString('en-CA', {timeZone:'America/Panama'}).slice(0,7);
const day = number => month + '-' + String(number).padStart(2,'0');
const crm = {id:'00000000-0000-4000-8000-000000000001',name:'Marina Pérez',start:day(2),end:day(5),guests:2,status:'confirmed',briefVersion:1,source:'crm',passengers:[],details:{},brief:{version:1,revision:1,sourceChanged:false,reviews:[]}};
const calendar = (over) => ({id:null,start:day(10),end:day(12),guests:2,primaryAge:null,status:'confirmed',briefVersion:0,reviewedAt:null,toCollectUsd:null,paid:null,source:'calendar',tentative:false,extras:[],...over});
const agency = calendar({name:'Lucía Ferraro · San Blas On Board',guestName:'Lucía Ferraro',agency:'San Blas On Board',kind:'agency',extras:['Aire acondicionado','Late check-out']});
const emili = calendar({name:'Hugo Brandt · Emili',guestName:'Hugo Brandt',agency:'Emili',kind:'seller',guests:6,start:day(14),end:day(18)});
const direct = calendar({name:'Erik Lund',guestName:'Erik Lund',agency:null,kind:'direct',start:day(20),end:day(22)});
const hold = calendar({name:'Tips on Boats (a confirmar)',guestName:null,agency:'Tips on Boats',kind:'agency',guests:6,tentative:true,start:day(24),end:day(26)});
const legacy = calendar({name:'Ana Soto · Blue Sailing',agency:'Blue Sailing',start:day(27),end:day(27)});

async function exercise(browser, role) {
  const context = await browser.newContext({viewport:{width:360,height:900},hasTouch:true,isMobile:true,serviceWorkers:'block',locale:'es-AR'});
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = [], unexpected = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const json = (body, status=200) => route.fulfill({status,json:body});
    if(url.hostname !== 'localhost') { unexpected.push(url.origin); return route.abort(); }
    if(p.startsWith('/a-bordo/')) {
      const relative = p.slice('/a-bordo/'.length) || 'index.html';
      if(!/^[\w./-]+$/.test(relative) || relative.includes('..')) return json({},404);
      const f = path.join(assets,relative);
      if(!fs.existsSync(f) || !fs.statSync(f).isFile()) return json({},404);
      return route.fulfill({path:f,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':'application/octet-stream'});
    }
    switch(p) {
      case '/api/boat/session':return json({user:{id:'qa-'+role,name:'QA '+role,admin:role==='administrador'},setup:false});
      case '/api/boat/boats':return json([{id:boat,name:'Nomade',role}]);
      case '/api/boat/state':return json({role,revision:1,state:{schema:1,boat:{name:'Nomade',equipment:[],currency:'USD'},products:[],movements:[],purchases:[],tasks:[],logs:[],cameras:[],manual:{content:''}}});
      case '/api/boat-ops/overview':return json({requests:[],notifications:[],fleet:[],transfers:[],members:[]});
      case '/api/boat-ops/reservations':return json([crm]);
      case '/api/boat-ops/agenda':return json([crm,agency,emili,direct,hold,legacy]);
      case '/api/boat/activity':return json([]);
      default:return json({});
    }
  });
  try {
    await page.goto('http://localhost:32190/a-bordo/?boat='+boat);
    await page.getByRole('navigation',{name:'Secciones del barco'}).getByRole('button',{name:/Agenda del mes/}).tap();
    const list = page.locator('.agenda-list');
    await list.locator('[data-agenda-open="'+crm.id+'"]').waitFor();
    const row = name => list.locator('.agenda-row').filter({has:page.locator('strong',{hasText:name})});
    const tags = async name => (await row(name).locator('.agenda-tag').allTextContents()).map(t => t.trim());

    if(role === 'chef') {
      // The crew without the full agenda only sees published guest cards: calendar rows stay out.
      assert.equal(await list.locator('.agenda-row').count(),1);
      assert.deepEqual(errors,[]);
      return;
    }
    assert.deepEqual(await tags('Lucía Ferraro'),['Agencia · San Blas On Board']);
    assert.equal(await row('Lucía Ferraro').locator('strong').textContent(),'Lucía Ferraro','the guest name stands alone');
    assert.match(await row('Lucía Ferraro').textContent(),/2 pasajeros/);
    assert.deepEqual(await tags('Hugo Brandt'),['Venta de Emili']);
    assert.deepEqual(await tags('Erik Lund'),['Solo calendario']);
    assert.deepEqual(await tags('Tips on Boats'),['Agencia · Tips on Boats','A confirmar']);
    assert.deepEqual(await tags('Ana Soto · Blue Sailing'),['Agencia · Blue Sailing'],'an older payload still reads right');
    assert.deepEqual((await tags('Marina Pérez')).slice(0,1),['Ficha enviada'],'CRM sales keep their guest card tags');

    assert.equal(await page.locator('[data-agenda-calendar-toggle]').getAttribute('open'),null,'the list is visible before the optional calendar');
    for(const name of ['Lucía Ferraro','Hugo Brandt','Erik Lund','Tips on Boats']){
      assert.equal(await row(name).evaluate(el=>el.tagName),'BUTTON');
      assert.equal(await row(name).getAttribute('data-agenda-open'),null);
      await row(name).tap();
      await page.locator('#brief-calendar-detail').waitFor();
      assert.match(await page.locator('#brief-calendar-detail').textContent(),/solo hay datos del calendario/);
      assert.equal(await page.locator('[data-brief-action="payment"],.brief-form').count(),0);
      if(name==='Lucía Ferraro')assert.match(await page.locator('#brief-calendar-detail').textContent(),/Aire acondicionado.*Late check-out/s);
      await page.getByRole('button',{name:/← Agenda del mes/}).tap();
    }
    await row('Marina Pérez').tap();
    await page.getByRole('heading',{name:'Marina Pérez'}).waitFor();
    assert.equal(await page.locator('#brief-calendar-detail').count(),0);
    await page.getByRole('button',{name:/← Agenda del mes/}).tap();
    await page.getByText('Ver calendario',{exact:true}).tap();
    const booking=page.locator('button.agenda-stay[data-agenda-calendar]').filter({hasText:/Lucía|LF/});
    await booking.first().tap();
    await page.getByRole('heading',{name:'Lucía Ferraro'}).waitFor();
    if(process.env.AGENDA_SCREENSHOT && role === 'capitan') await page.screenshot({path:process.env.AGENDA_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    assert.deepEqual(unexpected,[]);
  } finally {
    await context.close();
  }
}

(async()=>{
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),args:['--disable-background-networking']});
  try { for(const role of ['capitan','administrador','chef']) await exercise(browser,role); }
  finally { await browser.close(); }
  console.log('boat agenda calendar rows: ok');
})().catch(error => { console.error(error); process.exit(1); });
