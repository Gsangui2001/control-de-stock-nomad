const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync('public/a-bordo/depot-packages.js','utf8');
const UUID='9c126483-4119-41b2-9720-31d6f84e55d1', KEY='4dd1f940-b58a-4c72-a4dc-be412bd187c5';
function fixture({draft,failDraft}={}){
 const notices=[],edits=[];
 let stored=draft;
 const c=vm.createContext({HTMLElement:class {},customElements:{define(){}},draftRead:async()=>{if(failDraft)throw Error('offline');return stored;},
  editStoredDraft:async(k,f)=>{stored=f(stored);edits.push(stored);return stored;},toast:x=>notices.push(x),opsAfterSave:async()=>{}});
 const e=vm.runInContext(source+'\nnew StockroomPackages()',c);e.alive=()=>true;e.querySelector=()=>({});e.draw=()=>{};
 return {e,c,notices,edits,stored:()=>stored};
}
test('only exact typed package receipts confirm a send/receipt/difference',()=>{
 const {c}=fixture();
 const validate=vm.runInContext('packageReceiptIsValid',c),ok={ok:true,id:UUID,status:'received'};
 assert.equal(validate({op:'receive',payload:{id:UUID}},ok),true);
 for(const bad of [{},{...ok,ok:'true'},{...ok,id:KEY},{...ok,status:'in_transit'}])assert.equal(validate({op:'receive',payload:{id:UUID}},bad),false);
 assert.equal(validate({op:'issue',payload:{id:UUID}},{...ok,status:'review'}),true);
 assert.equal(validate({op:'send',payload:{}},{...ok,status:'in_transit'}),true);
 assert.equal(validate({op:'send',payload:{}},{...ok,status:'in_transit',id:'wrong'}),false);
});
test('uncertain write stays pending and is verified with the same payload, even if list is unavailable',async()=>{
 const draft={op:'receive',payload:{id:UUID,key:KEY,photo:UUID,verified:true}};
 const {e,notices,edits,stored}=fixture({draft});const payloads=[];
 e.fetch=async(op,payload)=>{if(op==='list')throw Error('offline');payloads.push(payload);return payloads.length===1?{}:{ok:true,id:UUID,status:'received'};};
 await e.read();assert.equal(e.listUnavailable,true);assert.equal(e.pending,draft);
 await e.save();assert.equal(e.pending,draft);assert.equal(stored(),draft);assert.equal(notices.length,0);assert.match(e.message,/No se pudo confirmar/);
 await e.save();assert.equal(e.pending,null);assert.equal(stored(),null);assert.deepEqual(payloads,[draft.payload,draft.payload]);assert.deepEqual(edits,[null]);assert.equal(notices.length,1);
});
test('failed verification does not erase a previous operation and unavailable local draft blocks a new one',async()=>{
 const draft={op:'issue',payload:{id:UUID,key:KEY}};
 const {e,stored}=fixture({draft});e.pending=draft;e.fetch=async()=>{throw Object.assign(Error('access'),{status:403});};
 await e.save();assert.equal(e.pending,draft);assert.equal(stored(),draft);
 const {e:locked}=fixture({failDraft:true});locked.fetch=async()=>[];await locked.read();
 assert.equal(locked.draftUnavailable,true);await locked.save();
});
