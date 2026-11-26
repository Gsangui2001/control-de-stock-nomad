const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Sí cobré is shown only for an authorized outstanding collection, and immediately sends the reservation and version',async()=>{
 let click, calls=[];
 const base={id:'res1',name:'Prueba',brief:{version:4},details:{captainCollection:'collect'},cashAssigned:true,captainBalance:{status:'known',amountUsd:1500,reportedCount:0}};
 const c={document:{addEventListener(type,fn){if(type==='click'&&!click)click=fn;},querySelector:()=>null},esc:x=>x,role:'capitan',Intl,
   opsBusy:false,opsReservationsView:()=>"",opsReservations:[base],uid:()=> 'stable-op-1',opsFetch:async(op,payload)=>{calls.push({op,payload});return {payment:{status:'cleared'}};},
   opsAfterSave:async()=>{},invalidateCaptainCash:()=>{},toast:()=>{},confirm:()=>assert.fail('no second confirmation')};
 vm.createContext(c);vm.runInContext(fs.readFileSync('public/a-bordo/briefs.js','utf8'),c);
 assert.match(c.briefPayment(base),/Sí cobré/);assert.match(c.briefPayment(base),/1[.,]500/);
 for(const overrides of [{cashAssigned:false},{cashLegacyReview:true},{captainPayment:{}},{details:{captainCollection:'none'}},
  {details:{}},{brief:{version:0}},{brief:{version:1,sourceChanged:true}},{captainBalance:{amountUsd:1500,status:'unknown'}},
  {captainBalance:{amountUsd:0,status:'known'}},{captainBalance:{amountUsd:1500,status:'known',reportedCount:1}}])
  assert.equal(c.briefPayment({...base,...overrides}),'');
 c.role='chef';assert.equal(c.briefPayment(base),'');c.role='capitan';
 const buttons={dataset:{briefAction:'payment',id:'res1'}};
 await click({target:{closest:()=>buttons}});
 assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{op:'brief_payment',payload:{key:'stable-op-1',id:'res1',version:4}});
 assert.equal(c.briefPayment(base),'');
});
