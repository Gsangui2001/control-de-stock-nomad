import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
const boat=z.string().regex(/^[a-f0-9-]{32,36}$/),short=z.string().trim().max(140);
const common={boat,key:z.string().uuid(),expenseId:z.string().min(1).max(100),version:z.number().int().nonnegative()};
const schemas={
 review:z.object({...common,category:z.enum(['','cocina','limpieza','mantenimiento','combustible','servicios','otros']),dueDate:z.string().date().or(z.literal('')),notes:z.string().max(2000),confirmed:z.literal(true)}),
 payment:z.object({...common,amount:z.number().positive().max(1e9).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001),currency:z.enum(['USD','EUR','ARS','PAB']),date:z.string().date(),payer:short.min(1),method:z.enum(['efectivo','transferencia','tarjeta','otro']),reference:short,notes:z.string().max(2000),photo:z.string().max(200).default(''),confirmed:z.literal(true)}),
 void:z.object({...common,paymentId:z.string().uuid(),reason:z.string().trim().min(3).max(2000)})
};
async function handle(req:NextRequest,{params}:{params:{operation:string}}){
 const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
  const secret=process.env.BOAT_CONTROL_SERVER_SECRET;if(!secret)return reply({error:'Servicio sin configurar'},503);
  let payload:any;
  if(req.method==='GET'&&params.operation==='list')payload={boat:boat.parse(req.nextUrl.searchParams.get('boat'))};
  else{
   if(req.method!=='POST'||!(params.operation in schemas))return reply({error:'Operación inexistente'},404);
   if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Origen no permitido'},403);
   if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Se requiere JSON'},415);
   const raw=await req.text();if(Buffer.byteLength(raw)>12000)return reply({error:'Registro demasiado grande'},413);
   payload=schemas[params.operation as keyof typeof schemas].parse(JSON.parse(raw));
  }
  payload.session=createHash('sha256').update(req.cookies.get('boat_session')?.value||'').digest('hex');
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const {data,error}=await client.rpc('boat_expenses_rpc',{server_key:secret,operation:params.operation,payload}).abortSignal(AbortSignal.timeout(15000));
  if(error)return reply({error:error.message},error.code==='28000'?401:error.code==='42501'?403:['PT409','23505'].includes(error.code)?409:/^(P0001|22|23)/.test(error.code||'')?400:503);
  return reply(data);
 }catch(e){return reply({error:e instanceof z.ZodError?'Revisá los campos y los importes.':'No se pudo confirmar. Conservá el formulario y reintentá.'},e instanceof z.ZodError||e instanceof SyntaxError?400:503);}
}
export const GET=handle;export const POST=handle;
