import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { validateRestoredBoatState } from '@/lib/boat-restore-validation';
import { readIntakeList, IntakeListError } from '@/lib/boat-intake';
import { flushBoatPush } from '@/lib/boat-push';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const text=z.string().trim().min(1).max(140), id=z.string().uuid();
const amount=z.number().finite().positive().max(1e9);
const common={boat:z.string().regex(/^[a-f0-9-]{32,36}$/),key:id};
const finite=z.number().finite().nonnegative().max(1e12);
const cashAmount=z.number().finite().min(0).max(1e9).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001);
const cashCurrency=z.enum(['USD','EUR','ARS','PAB']);
const planKeys=z.enum(['embarkation','embarkationTime','disembarkation','disembarkationTime','transport','activities','food','allergies','drinks','requests','onboardNotes']);
const rows=z.array(z.object({id:z.string().min(1)}).passthrough()).max(20000);
const backupSchema=z.object({version:z.literal(1),boat:common.boat,revision:z.number().int().nonnegative(),state:z.object({schema:z.literal(1),boat:z.object({name:text,currency:z.enum(['USD','EUR','ARS']),equipment:rows}).passthrough(),products:z.array(z.object({id:z.string().min(1),name:text,unit:text,current:finite,min:finite,cost:finite}).passthrough()),tasks:rows,logs:rows,movements:rows,purchases:rows,cameras:rows}).passthrough(),requests:z.array(z.record(z.unknown())),transfers:z.array(z.record(z.unknown())),reservations:z.array(z.record(z.unknown())),instructions:z.array(z.record(z.unknown())),collections:z.array(z.record(z.unknown())),photos:z.array(z.record(z.unknown())),intakes:z.array(z.record(z.unknown())).default([]),expenseControls:z.array(z.record(z.unknown())).default([]),expensePayments:z.array(z.record(z.unknown())).default([]),expenseHistory:z.array(z.record(z.unknown())).default([])});
const schemas:Record<string,z.ZodTypeAny>={
 guest_plan_save:z.object({...common,id,revision:z.number().int().nonnegative(),version:z.number().int().nonnegative(),changes:z.record(planKeys,z.string().trim().max(2000)).refine(changes=>Object.keys(changes).length>0)}).strict(),
 captain_opening:z.object({...common,captainId:text,amount:cashAmount,currency:cashCurrency}).strict(),
 fridge_move:z.object({...common,productId:text,quantity:z.number().int().positive().max(1000000)}).strict(),
 captain_personal_movement:z.object({...common,kind:z.enum(['personal_contribution','personal_withdrawal','personal_spend','personal_reimburse']),amount:cashAmount.refine(n=>n>0),currency:cashCurrency,concept:text}).strict(),
 captain_expense:z.object({...common,amount:cashAmount.refine(n=>n>0),currency:cashCurrency,concept:text}).strict(),
 captain_handover:z.object({...common,captainId:text,amount:cashAmount.refine(n=>n>0),currency:cashCurrency,note:z.string().trim().max(140).optional()}).strict(),
 warehouse_count:z.object({...common,name:text,unit:text.max(20),location:text,area:z.enum(['tecnica','gastronomia']),productId:z.string().max(140).optional(),quantity:finite.max(999999999.9999),revision:z.coerce.number().int().nonnegative(),
  unitCost:z.preprocess(v=>v==null||v===''?undefined:v,z.coerce.number().finite().min(0).max(1e9).optional()),currency:z.enum(['USD','EUR','ARS','PAB','']).optional()}),
 warehouse_photo_read:z.object({scope:z.literal('depot'),text:z.string().trim().min(1).max(12000)}).strict(),
 warehouse_photo_count:z.object({scope:z.literal('depot'),key:id,mode:z.enum(['count','replenish']).optional(),confirmed:z.literal(true),revision:z.number().int().nonnegative(),items:z.array(z.object({name:text,unit:text.max(20),location:text,area:z.enum(['tecnica','gastronomia']),productId:z.string().max(140).optional(),quantity:finite.lt(1e9).refine(n=>Math.abs(n*10000-Math.round(n*10000))<0.00025)}).strict()).min(1).max(100)}).strict(),
 warehouse_package_send:z.object({...common,photo:id,revision:z.number().int().nonnegative(),items:z.array(z.object({productId:text,packs:z.number().int().positive().max(1e6),perPack:amount,portionGrams:z.number().int().min(1).max(5000).optional()}).strict()).min(1).max(50)}).strict(),
 warehouse_package_receive:z.object({...common,id,photo:id,signature:id,verified:z.literal(true)}).strict(),
 warehouse_package_issue:z.object({...common,id,photo:id,note:z.string().trim().min(3).max(300)}).strict(),
 warehouse_transfer:z.object({...common,vessel:common.boat,productId:text,targetProductId:z.string().max(140).optional(),direction:z.enum(['toBoat','toDepot']),quantity:amount,location:text}),
 backup_restore:z.object({...common,revision:z.number().int().nonnegative(),backup:backupSchema}),
 request_create:z.object({...common,area:z.enum(['tecnica','gastronomia']),name:text,unit:text.max(20),quantity:amount,urgent:z.boolean(),notes:z.string().max(5000),photo:z.string().max(500).default('')}),
 request_status:z.object({...common,id,status:z.enum(['solicitado','aprobado','comprado','cancelado'])}),
 request_receive:z.object({...common,id,quantity:amount,productId:z.string().max(100).optional(),location:text}),
 stock_add:z.object({...common,name:text,area:z.enum(['tecnica','gastronomia']),unit:text.max(20),quantity:amount.or(z.literal(0)),location:text,note:z.string().max(500)}),
 stock_consume:z.object({...common,productId:text,quantity:amount,note:text.min(3)}),
 transfer_send:z.object({...common,productId:text,target:common.boat,quantity:amount}),
 transfer_receive:z.object({...common,id,quantity:amount,productId:z.string().max(100).optional(),location:text}),
 transfer_cancel:z.object({...common,id}),
 reservation_link:z.object({...common,id}),
 brief_save:z.object({...common,id,revision:z.number().int().nonnegative(),details:z.object(Object.fromEntries(['embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests'].map(k=>[k,z.string().trim().max(2000)]))).extend({country:z.string().trim().max(2000).optional(),airConditioning:z.string().trim().max(2000).optional()})}),
 brief_publish:z.object({...common,id,revision:z.number().int().nonnegative(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/)}),
 brief_payment:z.object({...common,id,version:z.number().int().positive()}).strict(),
 brief_review:z.object({...common,id,version:z.number().int().positive()}),
 reservation_preferences:z.object({...common,id,captainId:z.string().max(100),preferences:z.object({food:z.string().max(2000),allergies:z.string().max(2000),drinks:z.string().max(2000),activities:z.string().max(2000)})}),
 collection_instruction:z.object({...common,id,amount,currency:z.enum(['USD','EUR','ARS']),concept:text,dueDate:z.string().date(),verified:z.literal(true)}),
 collection_report:z.object({...common,id,amount,note:z.string().max(500)}),
 collection_review:z.object({...common,id,status:z.enum(['confirmado','rechazado'])}),
 notification_read:z.object({...common,id:z.number().int().positive()}),
 push_subscribe:z.object({...common,subscription:z.object({endpoint:z.string().url().max(2000),expirationTime:z.number().nullable().optional(),keys:z.object({auth:text,p256dh:z.string().min(20).max(200)})})}),
 push_unsubscribe:z.object({...common,endpoint:z.string().url().max(2000)}),
 push_test:z.object(common),
};
function validPushEndpoint(endpoint:string) {
 const url=new URL(endpoint);
 return url.protocol==='https:'&&!url.port&&!url.username&&!url.password && (url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.notify.windows.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com'));
}
async function handle(req:NextRequest,{params}:{params:{operation:string}}) {
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try {
  const secret=process.env.BOAT_CONTROL_SERVER_SECRET;
  if(!secret)return json({error:'Servicio sin configurar'},503);
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const operation=params.operation;
  let payload:any;
  if(req.method==='GET') {
   if(!['overview','fleet_stock','warehouse_package_list','warehouse_dashboard','reservations','agenda','guest_plan','reservation_candidates','external_templates','backup','captain_wallet'].includes(operation))return json({error:'Recurso inexistente'},404);
   payload=z.object({boat:common.boat}).parse({boat:req.nextUrl.searchParams.get('boat')});
   if(operation==='guest_plan')payload.id=id.parse(req.nextUrl.searchParams.get('id'));
   if(operation==='warehouse_dashboard')payload.scope=z.union([common.boat,z.literal('depot')]).parse(req.nextUrl.searchParams.get('scope')||payload.boat);
  } else {
   if(req.headers.get('origin') && req.headers.get('origin')!==req.nextUrl.origin && new URL(req.headers.get('origin')!).host!==req.headers.get('host'))return json({error:'Origen no permitido'},403);
   if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Se requiere JSON'},415);
   const maxBytes=operation==='backup_restore'?3500000:['brief_save','guest_plan_save','warehouse_photo_count'].includes(operation)?150000:30000;
   const raw=await req.text();if(Buffer.byteLength(raw)>maxBytes)return json({error:'Registro demasiado grande'},413);
   if(!schemas[operation])return json({error:'Operación desconocida'},404);
   payload=schemas[operation].parse(JSON.parse(raw));
   if(operation==='backup_restore') {
    try { validateRestoredBoatState(payload.backup.state,payload.boat); }
    catch(error) { return json({error:(error as Error).message},400); }
    const photoIds=new Set(payload.backup.photos.filter((photo:any)=>photo.boat_id===payload.boat).map((photo:any)=>photo.id));
    for(const entry of payload.backup.state.boat.equipment) {
     if(entry.photo&&!photoIds.has(entry.photo.split('&id=')[1]))return json({error:'Falta una foto de equipo en el respaldo de este barco.'},400);
    }
   }
   if(operation==='push_subscribe'&&!validPushEndpoint(payload.subscription.endpoint))return json({error:'Proveedor de notificaciones no admitido'},400);
   if(payload.photo&&!operation.startsWith('warehouse_package_')&&!new RegExp('^/api/boat/photos\\?boat='+payload.boat+'&id=[a-f0-9-]{36}$').test(payload.photo))return json({error:'Foto inválida'},400);
  }
  const sessionCookie=req.cookies.get('boat_session')?.value;
  if(!sessionCookie)return json({error:'Iniciá sesión para abrir el barco.'},401);
  payload.session=createHash('sha256').update(sessionCookie).digest('hex');
  // Previews can share the production database. Do not write stock from them.
  if(operation==='captain_personal_movement'&&process.env.VERCEL_ENV==='preview') return json({error:'Los movimientos de caja no se guardan en esta vista de prueba.'},403);
  if((operation==='warehouse_photo_count'||operation==='fridge_move'||req.method==='POST'&&operation.startsWith('warehouse_package_'))&&process.env.VERCEL_ENV==='preview')
   return json({error:'El guardado del depósito no está habilitado en esta vista de prueba.'},403);
  if(operation==='warehouse_photo_read') {
   const {error}=await client.rpc('boat_admin_stock_rpc',{server_key:secret,operation:'warehouse_dashboard',payload:{scope:'depot',session:payload.session}}).abortSignal(AbortSignal.timeout(15000));
   if(error)return json({error:error.code==='28000'?'Iniciá sesión.':error.code==='42501'?'Reservado a administración.':'No se pudo validar el acceso al depósito.'},error.code==='28000'?401:error.code==='42501'?403:503);
   try { return json({items:readIntakeList(payload.text,{simpleCount:true}).data.items.map(({name,quantity,unit,location})=>({name,quantity,unit,location}))}); }
   catch(error) { if(error instanceof IntakeListError)return json({error:error.message},400); throw error; }
  }
  const cash=operation.startsWith('captain_')||['collection_report','brief_payment'].includes(operation);
  const guestPlan=['agenda','reservations','guest_plan','guest_plan_save'].includes(operation);
  const rpc=operation==='fridge_move'?'boat_fridge_move_rpc':operation==='warehouse_photo_count'?'boat_stockroom_photo_count_rpc':operation.startsWith('warehouse_package_')?'boat_stockroom_package_rpc':guestPlan?'boat_guest_plan_rpc':cash?'boat_captain_cash_rpc':operation.startsWith('warehouse_')?'boat_admin_stock_rpc':operation==='fleet_stock'?'boat_inventory_rpc':operation.startsWith('brief_')||operation==='external_templates'?'boat_briefs_rpc':operation.startsWith('backup')?'boat_backup_rpc':'boat_operations_rpc';
  const {data,error}=await client.rpc(rpc,(['warehouse_photo_count','fridge_move'].includes(operation)?{server_key:secret,payload}:{server_key:secret,operation,payload})).abortSignal(AbortSignal.timeout(15000));
  if(error) {
   const status=error.code==='28000'?401:error.code==='42501'?403:['23505','40001','PT409','PFR01'].includes(error.code||'')?409: /^(P0001|22|23)/.test(error.code||'')?400:503;
   return json({error:error.code==='23505'?'Ese registro ya existe. Actualizá la vista.':error.message},status);
  }
  if(req.method==='POST'&&!['captain_personal_movement','fridge_move'].includes(operation)&&!guestPlan&&(!operation.startsWith('warehouse_')||operation.startsWith('warehouse_package_')))await flushBoatPush(5).catch(()=>{}); // Records already committed; delivery retries are durable.
  return json(operation==='overview'?{...data,pushPublicKey:process.env.BOAT_PUSH_PUBLIC_KEY||''}:data);
 }catch(error){return json({error:error instanceof z.ZodError?'Revisá los campos requeridos y las cantidades.':'No se pudo confirmar. Conservá el formulario y reintentá.'},error instanceof z.ZodError||error instanceof SyntaxError?400:503);}
}
export const GET=handle;
export const POST=handle;
