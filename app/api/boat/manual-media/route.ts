import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { manualOrigin, signedManualUrl } from '@/lib/boat-manual-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const boatId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const itemId = /^[A-Za-z0-9_-]{1,140}$/;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  version: z.literal(1),
  items: z.array(z.object({
    id: z.string().regex(itemId), title: z.string().min(1).max(300), area: z.string().max(300),
    description: z.string().max(8000), photos: z.array(z.object({ sha256, caption: z.string().max(2000) })).max(2),
    video: z.object({ sha256 }),
  })).max(500).refine(items => new Set(items.map(item => item.id)).size === items.length),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: privateHeaders });
}

async function authorizeBoat(cookie: string, boat: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.BOAT_CONTROL_SERVER_SECRET;
  if (!url || !key || !secret) throw new Error('Boat authorization unavailable');
  const session = createHash('sha256').update(cookie).digest('hex');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('boat_control_rpc', {
    server_key: secret, operation: 'boats', payload: { session },
  }).abortSignal(AbortSignal.timeout(10000));
  if (error?.code === '28000') return json({ error: 'Iniciá sesión para ver el manual.' }, 401);
  if (error && error.code !== '42501') throw new Error('Boat authorization unavailable');
  if (!error && !Array.isArray(data)) throw new Error('Invalid boat list');
  if (error || !data.some((entry: { id?: string } | null) => entry?.id === boat)) {
    return json({ error: 'Tu cuenta no tiene acceso a este barco.' }, 403);
  }
}

async function readManifest(origin: string, prefix: string) {
  const response = await fetch(signedManualUrl(origin, prefix + '/manifest.json'), {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(9000),
  });
  if (response.status === 404) return [];
  if (!response.ok || !response.body) throw new Error('Catalog unavailable');
  const limit = 2 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Catalog too large');
    }
    chunks.push(Buffer.from(value));
  }
  return manifestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))).items;
}

function assetHref(boat: string, item: string, asset: string) {
  return '/api/boat/manual-media?' + new URLSearchParams({ boat, item, asset });
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get('boat_session')?.value;
    if (!cookie) return json({ error: 'Iniciá sesión para ver el manual.' }, 401);
    const query = req.nextUrl.searchParams;
    const boat = query.get('boat') || '';
    const id = query.get('item');
    const asset = query.get('asset');
    if (!boatId.test(boat)) return json({ error: 'Barco inválido.' }, 400);
    if ((id !== null || asset !== null) && (!id || !itemId.test(id) || !asset || !/^(?:video|photo-[12])$/.test(asset))) {
      return json({ error: 'Archivo del manual inválido.' }, 400);
    }
    const origin = manualOrigin();
    if (!origin) return asset ? json({ error: 'No se encontró el archivo.' }, 404) : json({ items: [] });
    const denied = await authorizeBoat(cookie, boat);
    if (denied) return denied;
    const prefix = '/a-bordo-media/manual/' + boat;
    const items = await readManifest(origin, prefix);
    if (asset === null) {
      return json({ items: items.map(entry => ({
        id: entry.id, title: entry.title, area: entry.area, description: entry.description,
        photos: entry.photos.map((photo, i) => ({ url: assetHref(boat, entry.id, 'photo-' + (i + 1)), caption: photo.caption })),
        videoUrl: assetHref(boat, entry.id, 'video'),
      })) });
    }
    const entry = items.find(candidate => candidate.id === id);
    const media = asset === 'video' ? entry?.video : entry?.photos[asset === 'photo-1' ? 0 : 1];
    if (!media) return json({ error: 'No se encontró el archivo en el manual.' }, 404);
    const filename = media.sha256 + (asset === 'video' ? '.mp4' : '.jpg');
    // The device retrieves byte ranges directly from the vessel's private media origin.
    return NextResponse.redirect(signedManualUrl(origin, prefix + '/assets/' + filename), { status: 307, headers: privateHeaders });
  } catch {
    return json({ error: 'No se pudo abrir el manual. Volvé a intentar.' }, 503);
  }
}
