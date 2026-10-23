import { NextRequest,NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { flushBoatPush } from '@/lib/boat-push';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(req:NextRequest){
 const expected='Bearer '+(process.env.CRON_SECRET||'');const actual=req.headers.get('authorization')||'';
 if(!process.env.CRON_SECRET||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return NextResponse.json({error:'No autorizado'},{status:401});
 return NextResponse.json(await flushBoatPush(20));
}
