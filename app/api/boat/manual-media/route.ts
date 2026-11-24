import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { manualGrantCookie, verifyManualGrant } from '@/lib/boat-manual-grant';
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

function refreshRequired() {
  return json({ code: 'manual_boat_refresh', error: 'Volvé a entrar al barco para ver el manual.' }, 428);
}

async function readManifest(origin: string, prefix: string, grantExpires: number) {
  const response = await fetch(signedManualUrl(origin, prefix + '/manifest.json', grantExpires), {
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
    const grant = verifyManualGrant(req.cookies.get(manualGrantCookie)?.value, cookie, boat);
    if (grant.status === 'refresh') return refreshRequired();
    if (grant.status === 'denied') return json({ error: 'Tu cuenta no tiene acceso a este barco.' }, 403);
    const prefix = '/a-bordo-media/manual/' + boat;
    const items = await readManifest(origin, prefix, grant.exp);
    if (grant.exp <= Math.floor(Date.now() / 1000)) return refreshRequired();
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
    return NextResponse.redirect(signedManualUrl(origin, prefix + '/assets/' + filename, grant.exp), { status: 307, headers: privateHeaders });
  } catch {
    return json({ error: 'No se pudo abrir el manual. Volvé a intentar.' }, 503);
  }
}
