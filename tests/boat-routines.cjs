const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const R=require('../public/a-bordo/boat-rules.js');
const templates=require('../scripts/nomade-manual-routines.cjs');
assert.equal(new Set(templates.map(t=>t.id)).size,26);
assert.deepEqual(['chef','capitan','marinero'].map(role=>templates.filter(t=>t.assignedRole===role).length),[10,8,8]);
for(const t of templates){assert.equal(t.done,false);assert.equal(t.nextDate,'');assert.equal(t.nextHours,'');assert.equal(t.lastCompleted,undefined);assert.ok(t.sourceRef);}
assert.equal(R.repeatDate('2026-01-31',0,1),'2026-02-28');
assert.equal(R.repeatDate('2028-01-31',0,1),'2028-02-29');
assert.equal(R.repeatDate('2026-12-31',0,1),'2027-01-31');
const daily=structuredClone(templates.find(t=>t.intervalDays===1));
assert.equal(R.due(daily,'2026-10-23',0),'Primera realización');
R.completeTask(daily,'2026-10-21','');assert.equal(daily.nextDate,'2026-10-22');assert.equal(daily.done,false);
assert.equal(R.due(daily,'2026-10-23',0),'Vencido');
const weekly=structuredClone(templates.find(t=>t.intervalDays===7));R.completeTask(weekly,'2026-10-23','');assert.equal(weekly.nextDate,'2026-10-30');
const monthly=structuredClone(templates.find(t=>t.intervalMonths));R.completeTask(monthly,'2026-01-31','');assert.equal(monthly.nextDate,'2026-02-28');
const event=structuredClone(templates.find(t=>t.routineEvent));R.completeTask(event,'2026-10-23','');assert.equal(event.done,false);assert.equal(event.nextDate,'');assert.equal(R.due(event,'2027-10-23',0),'Según operación');
const cycle=structuredClone(templates.find(t=>t.routineCycle));assert.equal(cycle.cycleIndex,null);assert.throws(()=>R.completeTask(cycle,'2026-10-23',''));assert.throws(()=>R.completeTask(cycle,'2026-10-23','',15));R.completeTask(cycle,'2026-10-23','',14);assert.equal(cycle.cycleIndex,0);assert.equal(cycle.nextDate,'2026-10-24');assert.equal(cycle.done,false);
const sandbox={R,document:{addEventListener(){}},session:{id:'crew',name:'Yosani'},role:'chef',state:{tasks:templates},esc:s=>s,taskStatus:t=>R.due(t,'2026-10-23',0)};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/a-bordo/daily.js','utf8'),sandbox);
for(const [role,name,count] of [['chef','Yosani',10],['capitan','Tomás',8],['marinero','José',8]]){sandbox.role=role;sandbox.session.name=name;assert.equal(vm.runInContext('dayTasks().length',sandbox),count);const html=vm.runInContext('dayGroupedTasks()',sandbox);assert.ok(html.includes('Diarias'));assert.ok(html.includes('Semanales'));assert.ok(!html.includes('Motor babor'));}
sandbox.cycle=templates.find(t=>t.routineCycle);assert.ok(!vm.runInContext('dayCycleField(cycle)',sandbox).includes('selected'));
const ts=require('typescript'),access={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/boat-task-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:access});
const originalCycle=structuredClone(sandbox.cycle),sailor={id:'qa',name:'José'};
assert.equal(access.mergeCrewTasks([originalCycle],[{...originalCycle,cycleIndex:0}],sailor,'marinero')[0].cycleIndex,0);
assert.throws(()=>access.mergeCrewTasks([originalCycle],[{...originalCycle,cycleIndex:14}],sailor,'marinero'));
assert.throws(()=>access.mergeCrewTasks([originalCycle],[{...originalCycle,routineCycle:['Alterado']}],sailor,'marinero'));
assert.throws(()=>access.mergeCrewTasks([{id:'plain'}],[{id:'plain',cycleIndex:0}],sailor,'marinero'));
console.log('PASS: 26 manual-sourced routines, all role assignments, calendar months, first completion, service recurrence and 14-day cycle');
