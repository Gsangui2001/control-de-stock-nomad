// Exercise races that normal controls prevent but a late response can still trigger.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.STOCK_OVERLAY||process.env.STOCK_BASE||'.'),source=fs.readFileSync(path.join(root,'public/a-bordo/app.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {resolve,promise}}
function fixture(){
 const calls=[],store=new Map(),nodes=new Map(),f={session:{id:'admin'},boatId:'A',revision:1,state:{name:'A'},boatLoadSequence:0,activity:[],unseenActivity:[],filter:{},dayPage:'ops-stock',view:'day',dayTaskRole:'',dayManualRole:'',role:'admin',uid:()=> 'key',draftKey:()=> 'draft-A',render:()=>{},refreshActivity:async()=>{},toast:()=>{},draftRead:async k=>store.get(k),draftWrite:async(k,v)=>store.set(k,v),editStoredDraft:async(k,fn)=>{const value=fn(store.get(k));store.set(k,value);return value},$:q=>{if(!nodes.has(q))nodes.set(q,{});return nodes.get(q)}};
 f.api=async(...a)=>{calls.push(a);return await f.answer(...a)};vm.createContext(f);
 for(const [start,end] of [['function boatWriteContext','async function portableBackup'],['async function commit(','\nlet boatLoadSequence'],['async function loadBoat(id)','const activityStorageKey']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),f);
 return {f,calls,store};
}
const snapshot=()=>({boat:{name:'A',equipment:[{photo:'data:image/jpeg;base64,photo1'},{photo:'data:image/jpeg;base64,photo2'}]},products:[],tasks:[],logs:[]});
(async()=>{
 {const {f,calls}=fixture(),photo=deferred(),started=deferred();f.answer=(op)=>{assert.equal(op,'photos');started.resolve();return photo.promise};const save=f.commit(snapshot());await started.promise;f.boatId='B';f.state={name:'B'};photo.resolve({url:'photo-A'});await assert.rejects(save,/cambiaron/);assert.equal(calls.length,1);assert.equal(calls[0][2].boat,'A');}
 {const {f,calls,store}=fixture(),saved=deferred(),started=deferred();f.answer=(op)=>{if(op==='photos')return {url:'photo-A'};assert.equal(op,'state?boat=A');started.resolve();return saved.promise};const pending=f.commit(snapshot());await started.promise;f.boatId='B';f.state={name:'B'};saved.resolve({state:{name:'A saved'},revision:2});assert.equal(await pending,false);assert.equal(f.state.name,'B');assert.equal(f.revision,1);assert.equal(store.get('pending-state:admin:A'),null);assert.ok(calls.filter(c=>c[0]==='photos').every(c=>c[2].boat==='A'));}
 {const {f}=fixture();const b=deferred(),c=deferred();f.answer=op=>op==='state?boat=B'?b.promise:c.promise;const first=f.loadBoat('B'),second=f.loadBoat('C');c.resolve({state:{name:'C'},revision:3,role:'capitan'});await second;b.resolve({state:{name:'B'},revision:2,role:'marinero'});await first;assert.equal(f.boatId,'C');assert.equal(f.state.name,'C');assert.equal(f.role,'capitan');assert.equal(f.revision,3);}
 console.log('PASS: no photo or state mutation crosses boats, late PUT reconciles original draft, out-of-order boat changes preserve current boat.');
})().catch(e=>{console.error(e);process.exitCode=1});
