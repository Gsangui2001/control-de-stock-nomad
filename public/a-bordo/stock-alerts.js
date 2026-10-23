(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.BoatStockAlerts=rules;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function level(product){
  if(!product||product.current===null||product.current===''||product.current===undefined)return 0;
  const quantity=Number(product.current),minimum=Number(product.min);
  if(!Number.isFinite(quantity)||quantity<0)return 0;
  return quantity===0?2:minimum>0&&quantity<=minimum?1:0;
 }
 function body(kind,detail={}){
  if(kind==='brief_published')return `Ficha del viaje ${detail.start||''}: versión ${detail.version}. Abrila y confirmá tu revisión.`;
  if(kind==='stock_agotado')return `${detail.name||'Insumo'}: sin existencias registradas (${detail.current??0} ${detail.unit||''}).`;
  if(kind==='stock_minimo')return `${detail.name||'Insumo'}: quedan ${detail.current} ${detail.unit||''}. Mínimo: ${detail.min} ${detail.unit||''}.`;
  return kind==='push_test'?'Las notificaciones están activas.':'Tenés una novedad del barco.';
 }
 return {level,body,isAlert:kind=>['stock_minimo','stock_agotado'].includes(kind)};
});
