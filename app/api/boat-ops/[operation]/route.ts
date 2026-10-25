import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { validateRestoredBoatState } from '@/lib/boat-restore-validation';
import { flushBoatPush } from '@/lib/boat-push';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const text=z.string().trim().min(1).max(140), id=z.string().uuid();
const amount=z.number().finite().positive().max(1e9);
const common={boat:z.string().regex(/^[a-f0-9-]{32,36}$/),key:id};
const finite=z.number().finite().nonnegative().max(1e12);
const rows=z.array(z.object({id:z.string().min(1)}).passthrough()).max(20000);
const backupSchema=z.object({version:z.literal(1),boat:common.boat,revision:z.number().int().nonnegative(),state:z.object({schema:z.literal(1),boat:z.object({name:text,currency:z.enum(['USD','EUR','ARS']),equipment:rows}),products:z.array(z.object({id:z.string().min(1),name:text,unit:text,current:finite,min:finite,cost:finite}).passthrough()),tasks:rows,logs:rows,movements:rows,purchases:rows,cameras:rows}).passthrough(),requests:z.array(z.record(z.unknown())),transfers:z.array(z.record(z.unknown())),reservations:z.array(z.record(z.unknown())),instructions:z.array(z.record(z.unknown())),collections:z.array(z.record(z.unknown())),photos:z.array(z.record(z.unknown())),intakes:z.array(z.record(z.unknown())).default([]),expenseControls:z.array(z.record(z.unknown())).default([]),expensePayments:z.array(z.record(z.unknown())).default([]),expenseHistory:z.array(z.record(z.unknown())).default([])});
const schemas:Record<string,z.ZodTypeAny>={
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
 brief_save:z.object({...common,id,revision:z.number().int().nonnegative(),details:z.object(Object.fromEntries(['embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests'].map(k=>[k,z.string().trim().max(2000)])))}),
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
   if(!['overview','reservations','reservation_candidates','external_templates','backup'].includes(operation))return json({error:'Recurso inexistente'},404);
   payload=z.object({boat:common.boat}).parse({boat:req.nextUrl.searchParams.get('boat')});
  } else {
   if(req.headers.get('origin') && req.headers.get('origin')!==req.nextUrl.origin && new URL(req.headers.get('origin')!).host!==req.headers.get('host'))return json({error:'Origen no permitido'},403);
   if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Se requiere JSON'},415);
   const raw=await req.text();if(Buffer.byteLength(raw)>(operation==='backup_restore'?3500000:30000))return json({error:'Registro demasiado grande'},413);
   if(!schemas[operation])return json({error:'Operación desconocida'},404);
   payload=schemas[operation].parse(JSON.parse(raw));
   if(operation==='backup_restore')validateRestoredBoatState(payload.backup.state,payload.boat);
   if(operation==='push_subscribe'&&!validPushEndpoint(payload.subscription.endpoint))return json({error:'Proveedor de notificaciones no admitido'},400);
   if(payload.photo&&!new RegExp('^/api/boat/photos\\?boat='+payload.boat+'&id=[a-f0-9-]{36}$').test(payload.photo))return json({error:'Foto inválida'},400);
  }
  payload.session=createHash('sha256').update(req.cookies.get('boat_session')?.value||'').digest('hex');
  const rpc=operation.startsWith('brief_')||['reservations','external_templates'].includes(operation)?'boat_briefs_rpc':operation.startsWith('backup')?'boat_backup_rpc':'boat_operations_rpc';
  const {data,error}=await client.rpc(rpc,{server_key:secret,operation,payload}).abortSignal(AbortSignal.timeout(15000));
  if(error) {
   const status=error.code==='28000'?401:error.code==='42501'?403:error.code==='23505'?409: /^(P0001|22|23)/.test(error.code||'')?400:503;
   return json({error:status===409?'Ese registro ya está vinculado. Actualizá la vista.':error.message},status);
  }
  if(req.method==='POST')await flushBoatPush(5).catch(()=>{}); // Records already committed; delivery retries are durable.
  return json(operation==='overview'?{...data,pushPublicKey:process.env.BOAT_PUSH_PUBLIC_KEY||''}:data);
 }catch(error){return json({error:error instanceof z.ZodError?'Revisá los campos requeridos y las cantidades.':'No se pudo confirmar. Conservá el formulario y reintentá.'},error instanceof z.ZodError||error instanceof SyntaxError?400:503);}
}
export const GET=handle;
export const POST=handle;
