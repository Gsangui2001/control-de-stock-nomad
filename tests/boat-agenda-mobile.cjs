// Run with the project's browser QA settings (PLAYWRIGHT_MODULE and CHROMIUM_BIN).
// Nothing leaves this context: both the application and its boat API are local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const assets = path.resolve(__dirname, '../public/a-bordo');
const boat = 'a'.repeat(32);
const month = new Date().toLocaleDateString('en-CA', {timeZone:'America/Panama'}).slice(0,7);
const adjacentMonth = delta => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};
const day = number => month + '-' + String(number).padStart(2,'0');
const stay = (index, name, start, end, version) => ({
  id:'00000000-0000-4000-8000-' + String(index).padStart(12,'0'), name, start, end,
  guests:3, status:'confirmed', briefVersion:version, passengers:[], details:{},
  brief:{version,revision:1,sourceChanged:false,reviews:[]}
});
const cross = stay(1, 'María Inés del Río Fernández', adjacentMonth(-1)+'-27', day(4), 2);
const overlap = stay(2, 'Álvaro Fernández', day(3), day(6), 1);
const pending = stay(3, 'Lucía Costa', day(3), day(3), 0);
const next = stay(4, 'Tomás Vera', adjacentMonth(1)+'-12', adjacentMonth(1)+'-13', 1);
const bookings = [cross, overlap, pending, next];

async function exercise(browser, role) {
  const context = await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,serviceWorkers:'block',locale:'es-AR'});
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = [], unexpected = [], writes = [];
  const admin = role === 'administrador';
  const full = admin || role === 'capitan';
  const plans = new Map(bookings.map(b => [b.id,{
    revision:0,version:b.briefVersion,fields:{},values:{embarkation:'Muelle de prueba'},canEdit:admin || (role==='capitan' && b.id!==cross.id)
  }]));
  const prepared = {embarkation:'Muelle norte',embarkationTime:'09:30',onboardNotes:'Recibir al grupo junto a la pasarela.'};
  Object.assign(plans.get(pending.id),{revision:1,fields:{...prepared},values:{...prepared}});
  const withPlan = b => ({...b,onboardPlan:plans.get(b.id),details:{...b.details,...plans.get(b.id).fields},cashAssigned:role==='capitan'});
  let failAgenda = role === 'capitan', agendaRequests = 0;
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    const json = (body, status=200) => route.fulfill({status,json:body});
    if(url.hostname !== 'localhost') { unexpected.push(url.origin); return route.abort(); }
    if(req.method() !== 'GET' && req.method() !== 'HEAD') writes.push(p);
    if(p.startsWith('/a-bordo/')) {
      const relative = p.slice('/a-bordo/'.length) || 'index.html';
      if(!/^[\w./-]+$/.test(relative) || relative.includes('..')) return json({},404);
      const f = path.join(assets,relative);
      if(!fs.existsSync(f) || !fs.statSync(f).isFile()) return json({},404);
      return route.fulfill({path:f,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':'application/octet-stream'});
    }
    switch(p) {
      case '/api/boat/session':return json({user:{id:'qa-'+role,name:'QA '+role,admin},setup:false});
      case '/api/boat/boats':return json([{id:boat,name:'Nomade',role}]);
      case '/api/boat/state':return json({role,revision:1,state:{schema:1,boat:{name:'Nomade',equipment:[],currency:'USD'},products:[],movements:[],purchases:[],tasks:[],logs:[],cameras:[],manual:{content:''}}});
      case '/api/boat-ops/overview':return json({requests:[],notifications:[],fleet:[],transfers:[],members:[]});
      case '/api/boat-ops/reservations':return json(bookings.filter(b=>b.briefVersion || admin).map(withPlan));
      case '/api/boat-ops/agenda':
        agendaRequests++;
        return failAgenda ? json({error:'Lectura de agenda interrumpida para la prueba'},503) : json(bookings.map(withPlan));
      case '/api/boat-ops/guest_plan':return json(plans.get(url.searchParams.get('id')));
      case '/api/boat-ops/guest_plan_save':{
        const data = req.postDataJSON(), plan = plans.get(data.id);
        assert.equal(data.boat,boat);
        assert.ok(plan.canEdit);
        assert.ok(data.key);
        assert.equal(data.revision,plan.revision);
        assert.equal(data.version,plan.version);
        assert.deepEqual(Object.keys(data.changes).sort(),['embarkation','onboardNotes']);
        Object.assign(plan.fields,data.changes);
        Object.assign(plan.values,data.changes);
        plan.revision++;
        return json(plan);
      }
      case '/api/boat/activity':return json([]);
      default:return json({});
    }
  });
  try {
    await page.goto('http://localhost:32189/a-bordo/?boat='+boat);
    await page.getByRole('navigation',{name:'Secciones del barco'}).getByRole('button',{name:/Agenda del mes/}).tap();
    if(failAgenda) {
      await page.getByText('Lectura de agenda interrumpida para la prueba',{exact:false}).first().waitFor();
      failAgenda = false;
      await page.locator('[data-agenda-retry]').tap();
    }
    const rows = page.locator('.agenda-list');
    const entry = guest => rows.locator('[data-agenda-open="'+guest.id+'"]');
    await entry(cross).waitFor();
    assert.equal(await entry(next).count(),0,'next month stays out of this month');
    await page.locator('[data-agenda-day="'+day(3)+'"]').tap();
    await entry(overlap).waitFor();
    assert.equal(await entry(pending).count(),Number(full),'unpublished data reaches only the full agenda');
    await entry(overlap).tap();
    await page.getByRole('heading',{name:overlap.name,level:1,exact:true}).waitFor();
    assert.equal(await page.locator('article.brief-card').count(),1,'only the selected guest is rendered');
    assert.equal(new URL(page.url()).searchParams.get('reservation'),overlap.id,'opens the selected reservation');
    const edit = page.getByRole('button',{name:'Editar ficha',exact:true});
    assert.equal(await edit.count(),Number(full));
    if(role === 'capitan') {
      await edit.tap();
      const form = page.locator('[data-guest-plan-form]');
      await form.locator('[name=embarkation]').fill('Cambio cancelado');
      await page.getByRole('button',{name:'Cancelar',exact:true}).tap();
      assert.deepEqual(writes,[]);
      await edit.tap();
      assert.equal(await form.locator('[name=embarkation]').inputValue(),'Muelle de prueba');
      await form.locator('[name=embarkation]').fill('Muelle sur');
      await form.locator('[name=onboardNotes]').fill('Preparar embarque por popa.');
      await form.getByRole('button',{name:'Guardar cambios',exact:true}).tap();
      await page.locator('.guest-plan-note').filter({hasText:'Preparar embarque por popa.'}).waitFor();
      assert.equal(plans.get(overlap.id).revision,1);
      assert.equal(plans.get(cross.id).revision,0,'editing a guest never changes an overlapping reservation');
    }
    await page.getByRole('button',{name:'← Agenda del mes',exact:true}).tap();
    await entry(cross).waitFor();
    assert.equal(await page.locator('[data-agenda-day="'+day(3)+'"]').getAttribute('aria-pressed'),'true');
    await page.locator('.agenda-stay[data-agenda-open="'+cross.id+'"]').first().tap();
    await page.getByRole('heading',{name:cross.name,level:1,exact:true}).waitFor();
    assert.equal(await edit.count(),Number(admin),'another captain’s guest stays read-only');
    await page.getByRole('button',{name:'← Agenda del mes',exact:true}).tap();
    if(full) {
      await entry(pending).tap();
      await page.getByRole('heading',{name:pending.name,level:1,exact:true}).waitFor();
      assert.equal(await page.locator('[data-brief-action="review"]:visible').count(),0,'a draft has no published version to review');
      assert.equal(await page.locator('[data-brief-action="payment"]:visible').count(),0,'unpublished stays cannot take payment');
      if(role==='capitan') {
        await page.getByText(/Muelle norte/).first().waitFor();
        if(process.env.AGENDA_QA_SCREENSHOTS) {
          const snapshot = name => page.screenshot({path:path.join(process.env.AGENDA_QA_SCREENSHOTS,name),fullPage:true,animations:'disabled'});
          await page.locator('#toast.show').waitFor({state:'detached'});
          await snapshot('agenda-ficha-pendiente-movil.png');
          await edit.tap();
          await page.locator('[data-guest-plan-form]').waitFor();
          await snapshot('agenda-editar-ficha-movil.png');
          await page.getByRole('button',{name:'Cancelar',exact:true}).tap();
        }
      }
      await page.getByRole('button',{name:'← Agenda del mes',exact:true}).tap();
    }
    await page.locator('[data-agenda-all]').tap();
    await page.locator('[data-agenda-month="'+adjacentMonth(1)+'"]').tap();
    await entry(next).waitFor();
    assert.equal(await entry(overlap).count(),0);
    await page.locator('[data-agenda-month="'+month+'"]').tap();
    await entry(cross).waitFor();
    if(role==='capitan') {
      await entry(overlap).tap();
      await page.reload();
      await page.getByRole('heading',{name:overlap.name,level:1,exact:true}).waitFor();
      await page.locator('.guest-plan-note').filter({hasText:'Preparar embarque por popa.'}).waitFor();
      await edit.tap();
      assert.equal(await page.locator('[data-guest-plan-form] [name=embarkation]').inputValue(),'Muelle sur');
      await page.getByRole('button',{name:'Cancelar',exact:true}).tap();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),true,'no horizontal page overflow');
    assert.deepEqual(errors,[]);
    assert.deepEqual(unexpected,[]);
    assert.deepEqual(writes,role==='capitan'?['/api/boat-ops/guest_plan_save']:[]);
    if(full) assert.ok(agendaRequests > 0);
    console.log('PASS mobile agenda '+role);
  } finally { await context.close(); }
}

(async()=>{
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),args:['--disable-background-networking']});
  try { for(const role of ['capitan','administrador','chef','marinero']) await exercise(browser,role); }
  finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
