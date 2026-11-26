const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('chef can consult and report problems but cannot finish tasks through the API',()=>{
 const src=fs.readFileSync('lib/boat-task-access.ts','utf8');
 const exports={};vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
 const chef={id:'chef1',name:'Chef'}, sailor={id:'sailor1',name:'Sailor'};
 const kitchen={id:'k',title:'Revisar las dos heladeras',assignedRole:'chef',done:false};
 const cleaning={id:'b',title:'Limpieza de cubierta',assignedRole:'marinero',done:false};
 const before=[kitchen,cleaning];
 assert.equal(exports.mergeCrewTasks(before,[kitchen],chef,'chef')[0].done,false);
 for(const edit of [{done:true},{lastCompleted:'2026-11-26'},{nextDate:'2026-11-27'}])
  assert.throws(()=>exports.mergeCrewTasks(before,[{...kitchen,...edit}],chef,'chef'),/consulta sus tareas/);
 assert.equal(exports.mergeCrewTasks(before,[{...cleaning,done:true}],sailor,'marinero')[1].done,true);
 assert.equal(exports.chefWorkReportAllowed({reportKind:'problem',type:'Aviso',lines:[]}),true);
 assert.equal(exports.chefWorkReportAllowed({type:'Limpieza',lines:[]}),false);
 assert.equal(exports.chefWorkReportAllowed({reportKind:'problem',type:'Aviso',lines:[{}]}),false);
});
test('maintenance shows chef the guide, task detail and issue action instead of completion',()=>{
 const s=fs.readFileSync('public/a-bordo/daily.js','utf8');
 const ctx={session:{id:'chef1',admin:false,name:'Chef'},role:'chef',state:{logs:[],tasks:[{id:'k',title:'Revisar las dos heladeras',assignedRole:'chef',system:'Cocina',description:'Revisá higiene y conservación.'}]},esc:x=>x,R:{scheduleLabel:()=>""},taskStatus:()=> 'Vencido',writable:()=>true,empty:x=>x,document:{addEventListener(){}},date:x=>x};
 vm.createContext(ctx);vm.runInContext(s,ctx);
 vm.runInContext("daySelected='k'; dayBack=()=>'';",ctx);
 const m=ctx.dayMaintenance(),task=ctx.dayWorkForm('task'),row=ctx.dayTaskRow(ctx.state.tasks[0]);
 assert.match(m,/Mis responsabilidades/);assert.match(m,/Manual de instrucciones/);assert.match(m,/Avisar un problema/);assert.doesNotMatch(m,/Registrar trabajo/);
 assert.match(task,/Revisá higiene y conservación/);assert.match(task,/Abrir manual de Chef/);
 assert.doesNotMatch(task,/Guardar trabajo|<form/);assert.doesNotMatch(row,/Vencido/);
 ctx.role='marinero';assert.match(ctx.dayMaintenance(),/Registrar trabajo/);
});
