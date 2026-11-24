const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require.resolve('../public/a-bordo/intake.js'),'utf8');

function fixture() {
  const listeners = {}, calls = [], saved = new Map();
  const ctx = vm.createContext({
    session: {id: 'admin', admin: true}, boatId: 'babor', revision: 8, dayPage: 'ops-intake',
    document: {addEventListener: (type, fn) => (listeners[type] ||= []).push(fn)},
    setInterval() {}, clearTimeout() {}, structuredClone, uid: () => 'request-id', render() {},
    draftRead: async key => saved.get(key), draftWrite: async (key,v) => saved.set(key,v),
    fetch: async (url, options) => {
      calls.push([url, options.body && JSON.parse(options.body)]);
      return {ok:true, json:async()=>({data:{items:[]}})};
    }
  });
  vm.runInContext(source,ctx);
  const form = {id:'intakeInput',reportValidity:()=>true,elements:{text:{value:'Lista'},kind:{value:'count'},files:{files:[]}},
    querySelector:()=>({disabled:false,textContent:''})};
  return {ctx,calls,saved,form,submit:()=>listeners.submit[0]({target:form,preventDefault(){}})};
}

test('un cambio de barco mientras se lee la lista no prepara ni guarda filas en el destino',async()=>{
  const {ctx,calls,saved,submit}=fixture();
  let started,finish;
  const scanning=new Promise(resolve=>{started=resolve;});
  ctx.fetch=async(url,{body})=>{
    calls.push(JSON.parse(body).boat);started();
    await new Promise(resolve=>{finish=resolve;});
    return {ok:true,json:async()=>({data:{items:[]}})};
  };
  const request=submit();await scanning;
  ctx.boatId='estribor';finish();await request;
  assert.deepEqual(calls,['babor']);assert.equal(saved.size,0);
  assert.equal(vm.runInContext('intakeDraft',ctx),null);
});

test('una respuesta antigua de la lista no reemplaza las cargas de otra cuenta',async()=>{
  const {ctx}=fixture();let complete;
  ctx.fetch=()=>new Promise(resolve=>{complete=resolve;});
  const old=vm.runInContext('intakeReload()',ctx);
  ctx.session={id:'otra-cuenta',admin:true};
  complete({ok:true,json:async()=>[{id:'old'}]});await old;
  assert.equal(vm.runInContext('intakeDocs',ctx),null);
});

test('la API recibe el barco capturado aunque cambie la selección',async()=>{
  const {ctx,calls}=fixture();
  const scope=vm.runInContext('intakeContext()',ctx);ctx.boatId='estribor';
  await ctx.intakeFetch('apply',{id:'doc'},scope.boat);
  assert.equal(calls[0][1].boat,'babor');assert.equal(scope.active(),false);
});

for(const outcome of ['lector no disponible','sin texto']){
  test(outcome+' permite conservar la foto y pasar a revisión manual',async()=>{
    const {ctx,form,submit,saved}=fixture();
    form.elements.text.value='';
    form.elements.files.files=[{name:'etiqueta.jpg',type:'image/jpeg',size:1000}];
    ctx.photo=async()=>'foto de ensayo';
    ctx.intakeOcr=async()=>{if(outcome==='sin texto')return '  ';throw Error('lector no disponible');};
    ctx.api=async(_path,_method,payload)=>({url:'/foto/'+payload.boat});
    let scans=0;
    ctx.fetch=async()=>{scans++;return {ok:true,json:async()=>({needsOcr:true,data:{items:[]}})};};
    await submit();
    assert.equal(scans,1);
    const doc=saved.get('intake:admin:babor');
    assert.equal(doc.source.photos[0],'/foto/babor');
    assert.equal(doc.data.items.length,0);
    assert.match(doc.notice,/foto adjunta/);
  });
}
