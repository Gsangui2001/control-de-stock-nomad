import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
class ApiError extends Error { constructor(public status:number, message:string){super(message);} }
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const passwordHash = (password:string, salt=randomBytes(16).toString('hex')) => salt+':'+pbkdf2Sync(password,salt,310000,32,'sha256').toString('hex');
const emptyState = (name:string) => ({schema:1,boat:{name,model:'',currency:'USD',equipment:[]},products:[],tasks:[],logs:[],movements:[],purchases:[],cameras:[],manual:{content:'',updatedAt:'',updatedBy:''}});
const required = (value:unknown,max=140):string => { if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,'Completá los campos requeridos.');return value.trim(); };
const roles=['capitan','marinero','lector','encargado'];
function validateState(s:any,boat:string) {
 if(!s||s.schema!==1||!s.boat)throw new ApiError(400,'Formato de respaldo inválido.');
 required(s.boat.name);
 if(!['USD','ARS','EUR'].includes(s.boat.currency))throw new ApiError(400,'Moneda inválida.');
 const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<1e12;
 for(const key of ['products','tasks','logs','movements','purchases','cameras']) {
  if(!Array.isArray(s[key])||s[key].length>20000||s[key].some((x:any)=>!x||typeof x.id!=='string')||new Set(s[key].map((x:any)=>x.id)).size!==s[key].length)throw new ApiError(400,'Datos inválidos en '+key);
 }
 if(!Array.isArray(s.boat.equipment)||s.boat.equipment.some((e:any)=>!e||typeof e.id!=='string'||typeof e.name!=='string'||!number(e.hours)))throw new ApiError(400,'Equipos inválidos.');
 const photo=(v:any)=>typeof v==='string'&&new RegExp('^/api/boat/photos\\?boat='+boat+'&id=[a-f0-9-]{36}$').test(v);
 for(const p of s.products){required(p.name);if(typeof p.unit!=='string'||['current','min','cost'].some(k=>!number(p[k]))||(p.photo&&!photo(p.photo)))throw new ApiError(400,'Insumo inválido.');}
 for(const l of s.logs)if(typeof l.title!=='string'||typeof l.date!=='string'||!Array.isArray(l.lines)||!Array.isArray(l.photos)||l.photos.some((v:any)=>!photo(v)))throw new ApiError(400,'Trabajo inválido.');
 for(const p of s.purchases)if(!Array.isArray(p.lines)||typeof p.date!=='string')throw new ApiError(400,'Compra inválida.');
 for(const t of s.tasks)if(typeof t.title!=='string'||(t.photo&&!photo(t.photo)))throw new ApiError(400,'Tarea inválida.');
}
function stateForRole(result:any, admin:boolean, role=result.role) {
 const visible=structuredClone(result);
 if(!admin&&role!=='encargado')visible.state.cameras=[];
 return visible;
}
async function handle(req:NextRequest,{params}:{params:{operation:string}}) {
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try {
  const secret=process.env.BOAT_CONTROL_SERVER_SECRET;
  if(!secret)throw new ApiError(503,'El servicio está en preparación.');
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const session=hash(req.cookies.get('boat_session')?.value||'');
  const rpc=async (operation:string,payload:Record<string,unknown>={}) => {
   const {data,error}=await client.rpc('boat_control_rpc',{server_key:secret,operation,payload:{...payload,session}}).abortSignal(AbortSignal.timeout(15000));
   if(error){const status=({'28000':401,'42501':403,'P0002':404,'40001':409,'PT409':409,'23505':409,'P0001':429} as Record<string,number>)[error.code]||500;throw new ApiError(status,status===500?'No se pudo guardar. Intentá nuevamente.':error.code==='23505'?'Ese usuario ya existe.':error.message);}
   return data;
  }
  let body:any={};
  if(req.method!=='GET'){
   const origin=req.headers.get('origin');
   if(origin&&origin!==req.nextUrl.origin&&new URL(origin).host!==req.headers.get('host'))throw new ApiError(403,'Origen no permitido.');
   if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Se requiere JSON.');
   const raw=await req.text();if(Buffer.byteLength(raw)>3500000)throw new ApiError(413,'El registro es demasiado grande. Exportá un respaldo y dividí los adjuntos.');
   try{body=JSON.parse(raw);}catch{throw new ApiError(400,'Datos inválidos.');}
   if(!body||Array.isArray(body)||typeof body!=='object')throw new ApiError(400,'Datos inválidos.');
  }
  const op=params.operation, method=req.method;
  const boat=req.nextUrl.searchParams.get('boat')||body.boat;
  if(boat&&!/^[a-f0-9-]{32,36}$/.test(boat))throw new ApiError(400,'Barco inválido.');
  if(op==='session'&&method==='GET')return json(await rpc('session'));
  if(op==='login'&&method==='POST'){
   const username=required(body.username).toLowerCase(), password=(required(body.password,1024),body.password as string);
   const account=await rpc('account',{username});
   const candidate=passwordHash(password,account?.password.split(':')[0]||'00000000000000000000000000000000');
   if(!account||candidate.length!==account.password.length||!timingSafeEqual(Buffer.from(candidate),Buffer.from(account.password))){await rpc('login_failure',{username});throw new ApiError(401,'Usuario o contraseña incorrectos.');}
   const token=randomBytes(32).toString('base64url');await rpc('session_create',{token:hash(token),user_id:account.id});
   const res=json({ok:true});res.cookies.set('boat_session',token,{httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'strict',path:'/',maxAge:86400});return res;
  }
  const auth=await rpc('session');if(!auth.user)throw new ApiError(401,'Iniciá sesión para continuar.');
  if(op==='logout'&&method==='POST'){await rpc('logout');const res=json({ok:true});res.cookies.set('boat_session','',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});return res;}
  if(op==='boats'&&method==='GET')return json(await rpc('boats'));
  if(op==='boats'&&method==='POST'){const name=required(body.name);return json(await rpc('boat_create',{id:randomBytes(16).toString('hex'),name,state:emptyState(name)}),201);}
  if(op==='users'&&method==='GET')return json(await rpc('users'));
  if(op==='activity'&&method==='GET')return json(await rpc('activity',{boat}));
  if(op==='users'&&method==='POST'){
   const name=required(body.name), username=required(body.username).toLowerCase(),password=(required(body.password,1024),body.password as string);
   if(password.length<10||!roles.includes(body.role))throw new ApiError(400,'Usá una contraseña de al menos 10 caracteres y seleccioná un rol.');
   return json(await rpc('user_create',{boat,id:randomBytes(16).toString('hex'),name,username,password:passwordHash(password),role:body.role}),201);
  }
  if(op==='access'&&method==='POST'){if(![...roles,'sin_acceso'].includes(body.role))throw new ApiError(400,'Rol inválido.');return json(await rpc('access',{boat,user:required(body.user),role:body.role}));}
  if(op==='state'&&method==='GET')return json(stateForRole(await rpc('state_get',{boat}),auth.user.admin));
  if(op==='state'&&method==='PUT'){
   const before=await rpc('state_get',{boat});
   if(!auth.user.admin&&before.role!=='encargado'){
    body.state.cameras=before.state.cameras;
    body.state.manual=before.state.manual??{content:'',updatedAt:'',updatedBy:''};
   }
   validateState(body.state,boat);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw new ApiError(400,'Revisión inválida.');
   const logs=new Map<string,any>(before.state.logs.map((l:any)=>[l.id,l]));
   for(const l of body.state.logs){const old=logs.get(l.id);l.recordedBy=old?.recordedBy??auth.user.name;l.recordedById=old?.recordedById??(old?undefined:auth.user.id);l.recordedAt=old?.recordedAt??new Date().toISOString();}
   return json(stateForRole(await rpc('state_put',{boat,state:body.state,revision:body.revision}),auth.user.admin,before.role));
  }
  if(op==='photos'&&method==='POST'){
   const data=body.data;
   if(typeof data!=='string'||data.length>1800000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data))throw new ApiError(400,'Foto inválida o demasiado grande.');
   const saved=await rpc('photo_put',{boat,data,digest:hash(data)});return json({url:'/api/boat/photos?boat='+boat+'&id='+saved.id});
  }
  if(op==='photos'&&method==='GET'){
   const id=req.nextUrl.searchParams.get('id');if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new ApiError(400,'Foto inválida.');
   const photo=await rpc('photo_get',{boat,id});const [prefix,data]=photo.data.split(',');
   return new NextResponse(Buffer.from(data,'base64'),{headers:{'Content-Type':prefix.slice(5).split(';')[0],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  throw new ApiError(404,'Recurso no encontrado.');
 }catch(error){return json({error:error instanceof ApiError?error.message:'No se pudo completar la acción.'},error instanceof ApiError?error.status:500);}
}
export const GET=handle;export const POST=handle;export const PUT=handle;
