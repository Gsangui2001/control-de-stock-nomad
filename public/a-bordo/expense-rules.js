(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ExpenseRules=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const categories={'':'Sin clasificar',cocina:'Cocina y bebidas',limpieza:'Limpieza',mantenimiento:'Mantenimiento',combustible:'Combustible',servicios:'Servicios',otros:'Otros'};
 const labels={unreviewed:'Sin revisar',changed:'Revisar cambios',pending:'Pendiente de pago',partial:'Pago parcial',paid:'Pagado',missing:'Gasto no disponible'};
 const cents=n=>Math.round(Number(n)*100);
 function rows(data,day){
  return data.expenses.map(expense=>{
   const control=data.controls.find(c=>c.expense_id===expense.id),payments=data.payments.filter(p=>p.expense_id===expense.id),active=payments.filter(p=>!p.voided_at);
   const currency=expense.currency||data.currency,total=cents(expense.total),paid=active.filter(p=>p.currency===currency).reduce((sum,p)=>sum+cents(p.amount),0),remaining=Math.max(0,total-paid);
   const snap=control?.expense_snapshot,changed=Boolean(snap&&(cents(snap.total)!==total||snap.currency!==currency||['date','supplier','reference'].some(k=>(snap[k]||'')!==(expense[k]||''))))||active.some(p=>p.currency!==currency)||paid>total;
   const status=changed?'changed':!control?.reviewed?'unreviewed':remaining===0?'paid':paid?'partial':'pending';
   return {...expense,currency,totalCents:total,paidCents:paid,remainingCents:remaining,control,payments,status,category:control?.category||'',overdue:['pending','partial'].includes(status)&&!!control?.due_date&&control.due_date<day};
  });
 }
 function filter(rows,filters){return rows.filter(r=>(!filters.from||r.date>=filters.from)&&(!filters.to||r.date<=filters.to)&&(filters.category==='all'||!filters.category||r.category===filters.category||filters.category==='unclassified'&&!r.category)&&(!filters.status||filters.status==='all'||filters.status==='overdue'&&r.overdue||r.status===filters.status)&&(!filters.query||[r.supplier,r.reference,r.notes].join(' ').toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())));}
 function totals(rows){const result={};for(const r of rows){const t=result[r.currency]||(result[r.currency]={expense:0,paid:0,pending:0,unreviewed:0,overdue:0});t.expense+=r.totalCents;t.paid+=r.paidCents;if(['unreviewed','changed'].includes(r.status))t.unreviewed+=r.remainingCents;else t.pending+=r.remainingCents;if(r.overdue)t.overdue+=r.remainingCents;}return result;}
 const csvCell=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';
 function csv(rows){return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
 return {categories,labels,cents,rows,filter,totals,csv};
});
