import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { get, issueSignedToken, presignUrl } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
const itemSchema = z.object({
  id: z.string().regex(itemId),
  title: z.string().min(1).max(300),
  area: z.string().max(300),
  description: z.string().max(8000),
  photos: z.array(z.object({ sha256, caption: z.string().max(2000) })).max(2),
  video: z.object({ sha256 }),
});
const manifestSchema = z.object({
  version: z.literal(1),
  items: z.array(itemSchema).max(500).refine(items => new Set(items.map(item => item.id)).size === items.length),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: privateHeaders });
}

async function authorizeBoat(req: NextRequest, boat: string) {
  const cookie = req.cookies.get('boat_session')?.value;
  if (!cookie) return json({ error: 'Iniciá sesión para ver el manual.' }, 401);
  if (!boatId.test(boat)) return json({ error: 'Barco inválido.' }, 400);
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

async function readManifest(boat: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return [];
  const result = await get('manual/' + boat + '/manifest.json', {
    access: 'private', useCache: false, abortSignal: AbortSignal.timeout(10000),
  });
  if (result === null) return [];
  if (result.statusCode !== 200) throw new Error('Unexpected manifest status');
  if (result.blob.size > 2 * 1024 * 1024) {
    await result.stream.cancel();
    throw new Error('Manifest too large');
  }
  return manifestSchema.parse(await new Response(result.stream).json()).items;
}

function assetHref(boat: string, item: string, asset: string) {
  return '/api/boat/manual-media?' + new URLSearchParams({ boat, item, asset });
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    const boat = query.get('boat') || '';
    const denied = await authorizeBoat(req, boat);
    if (denied) return denied;

    const id = query.get('item');
    const asset = query.get('asset');
    if (id !== null || asset !== null) {
      if (!id || !itemId.test(id) || !asset || !/^(?:video|photo-[12])$/.test(asset)) {
        return json({ error: 'Archivo del manual inválido.' }, 400);
      }
    }
    const items = await readManifest(boat);
    if (id === null || asset === null) {
      return json({ items: items.map(item => ({
        id: item.id, title: item.title, area: item.area, description: item.description,
        photos: item.photos.map((photo, i) => ({ url: assetHref(boat, item.id, 'photo-' + (i + 1)), caption: photo.caption })),
        videoUrl: assetHref(boat, item.id, 'video'),
      })) });
    }

    const item = items.find(entry => entry.id === id);
    const media = asset === 'video' ? item?.video : item?.photos[asset === 'photo-1' ? 0 : 1];
    if (!media) return json({ error: 'No se encontró el archivo en el manual.' }, 404);
    const extension = asset === 'video' ? '.mp4' : '.jpg';
    const pathname = 'manual/' + boat + '/assets/' + media.sha256 + extension;
    const validUntil = Date.now() + 5 * 60 * 1000;
    const operation = req.method === 'HEAD' ? 'head' : 'get';
    const token = await issueSignedToken({ pathname, operations: [operation], validUntil, abortSignal: AbortSignal.timeout(8000) });
    const { presignedUrl } = await presignUrl(token, { pathname, operation, access: 'private', validUntil });
    // Redirect byte-range requests to the private store so seeking works without buffering videos here.
    return NextResponse.redirect(presignedUrl, { status: 307, headers: privateHeaders });
  } catch {
    return json({ error: 'No se pudo abrir el manual. Volvé a intentar.' }, 503);
  }
}
