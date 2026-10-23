import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
export async function flushBoatPush(limit=10) {
 const secret=process.env.BOAT_CONTROL_SERVER_SECRET, privateKey=process.env.BOAT_PUSH_PRIVATE_KEY, publicKey=process.env.BOAT_PUSH_PUBLIC_KEY;
 if(!secret||!privateKey||!publicKey)return {configured:false,sent:0};
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 const {error:reminderError}=await client.rpc('boat_reminders_rpc',{server_key:secret});
 if(reminderError)throw Error('No se pudieron revisar los recordatorios');
 const rpc=async(operation:string,payload:any)=>{const {data,error}=await client.rpc('boat_push_worker_rpc',{server_key:secret,operation,payload});if(error)throw Error(error.message);return data;};
 const jobs=await rpc('claim',{limit});let sent=0;
 await Promise.all(jobs.map(async(job:any)=>{
  try {
   const url=new URL(job.subscription.endpoint);
   if(url.protocol!=='https:' || url.port || !(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.apple.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com')))throw Object.assign(Error('Endpoint inválido'),{statusCode:410});
   await webpush.sendNotification(job.subscription,JSON.stringify({title:'A bordo',body:job.kind==='push_test'?'Las notificaciones están activas.':'Tenés una novedad del barco.',tag:'boat-'+job.notification_id,url:'/a-bordo/index.html?boat='+encodeURIComponent(job.boat_id)+'&notifications=1'}),{vapidDetails:{subject:'https://control-de-stock-nomad.vercel.app',publicKey,privateKey},TTL:86400,timeout:5000});
   await rpc('finish',{id:job.id,lease:job.lease_until,status:'sent'});sent++;
  }catch(error:any){await rpc('finish',{id:job.id,lease:job.lease_until,status:[404,410].includes(error.statusCode)?'expired':'retry',error:String(error.statusCode||'network')});}
 }));
 return {configured:true,sent};
}
