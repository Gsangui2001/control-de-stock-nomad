"use strict";
// Preview branch only. No API request from this demo is allowed to hit a live service.
(() => {
 const role = new URLSearchParams(location.search).get("qa-role");
 const roles = new Map([["administrador","Administración"],["capitan","Capitán"],["chef","Chef"]]);
 if (!roles.has(role)) return;
 const boat="6bf8e2dceb8157d62159ae7bd29967fd", id="10000000-0000-4000-8000-000000000001";
 const month=new Date().toLocaleDateString("en-CA",{timeZone:"America/Panama"}).slice(0,7);
 const row={id,name:"Familia ficticia · QA",start:month+"-10",end:month+"-12",status:"confirmed",guests:2,briefVersion:0};
 const admin=role==="administrador",captain=role==="capitan";
 let revision=5,draft={transport:"Traslado de ejemplo"};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
 const originalFetch=window.fetch.bind(window);
 window.fetch=async (input,options={}) => {
  const url=new URL(typeof input==="string"?input:input.url,location.origin);
  if(url.origin!==location.origin)return json({error:"Acceso externo bloqueado en esta demostración."},403);
  if(!url.pathname.startsWith("/api/"))return originalFetch(input,options);
  const op=url.pathname.split("/").pop(),method=(options.method||input.method||"GET").toUpperCase();
  if(method!=="GET"){
   if(op!=="brief_save"||!admin||method!=="POST")return json({error:"Acción deshabilitada en esta demostración."},403);
   const body=JSON.parse(options.body||"{}");
   if(body.id!==id||body.boat!==boat||body.revision!==revision||!body.key||!body.details)return json({error:"Datos ficticios o revisión incorrectos."},409);
   for(const k of Object.keys(body.details))if(typeof body.details[k]!=="string"||body.details[k].length>2000)return json({error:"Valor de ejemplo no válido."},400);
   draft=body.details;revision++;return json({ok:true});
  }
  switch(op){
   case "session":return json({user:{id:"qa-"+role,name:"Sesión ficticia · "+roles.get(role),admin}});
   case "boats":return json([{id:boat,name:"Nomade",role}]);
   case "state":return json({revision:0,role,state:{schema:1,boat:{name:"Nomade",currency:"USD",equipment:[]},products:[],tasks:[],logs:[],purchases:[],movements:[],cameras:[],manual:{content:""}}});
   case "overview":return json({requests:[],transfers:[],fleet:[],notifications:[],members:[],pushPublicKey:""});
   case "activity":return json([]);
   case "reservations":return json(admin?[{...row,brief:{version:0,revision,draft},preferences:{},reports:[]}]:[]);
   case "agenda":return json(admin?[row]:captain?[{...row,operationalPreview:{charterType:"shared",transportRequired:true,transportStatus:"confirmed",confirmedTransferTimes:[{direction:"outbound",pickupAt:month+"-10T11:00:00.000Z"}]}}]:[]);
   case "guest_plan":return json({fields:{},canEdit:false,revision:0,version:0});
   default:return json([]);
  }
 };
 addEventListener("DOMContentLoaded",()=>{
  const banner=document.createElement("aside");
  banner.style.cssText="position:relative;z-index:20;padding:8px 14px;background:#fff6d9;color:#263b44;font:14px system-ui";
  banner.append("Prueba aislada · datos ficticios · No ingreses datos reales. Roles: ");
  for(const [key,label] of roles){
   const a=document.createElement("a");a.href="?qa-role="+key;a.textContent=label;
   a.style.marginRight="12px";a.style.textDecoration="underline";banner.append(a);
  }
  document.body.prepend(banner);
 },{once:true});
})();
