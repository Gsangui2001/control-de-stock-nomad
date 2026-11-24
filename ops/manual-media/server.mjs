import { createPublicKey, verify } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const prefix = '/a-bordo-media/';
const mediaPath = /^manual\/(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(?:manifest\.json|assets\/[0-9a-f]{64}\.(?:mp4|jpg))$/;
const mediaTypes = { json: 'application/json', mp4: 'video/mp4', jpg: 'image/jpeg' };

function isAuthorized(url, publicKey) {
  const expires = url.searchParams.get('exp') || '';
  const signature = url.searchParams.get('sig') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d{10}$/.test(expires) || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  if (Number(expires) <= now || Number(expires) > now + 330) return false;
  if ([...url.searchParams].length !== 2) return false;
  const message = Buffer.from(`nomad-manual-v1\n${url.pathname}\n${expires}`, 'utf8');
  return verify(null, message, publicKey, Buffer.from(signature, 'base64url'));
}

// Return undefined for a full response and null for an unsatisfiable byte range.
function byteRange(value, size) {
  if (!value) return undefined;
  const range = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!range) return undefined;
  const [, first, last] = range;
  if (!first && !last) return undefined;
  if (!size) return null;
  if (!first) {
    const suffix = Number(last);
    if (!suffix) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  const end = last ? Math.min(Number(last), size - 1) : size - 1;
  return start >= size || end < start ? null : { start, end };
}

export function manualServer(dataDir, publicPem) {
  const key = createPublicKey(publicPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Se requiere una clave pública Ed25519.');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', 'https://control-de-stock-nomad.vercel.app');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
    const finish = status => { res.writeHead(status); res.end(); };
    let file;
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return finish(405);
      }
      const url = new URL(req.url, 'http://manual.invalid');
      const relative = url.pathname.slice(prefix.length);
      if (!url.pathname.startsWith(prefix) || !mediaPath.test(relative)) return finish(404);
      if (!isAuthorized(url, key)) return finish(403);
      file = await open(resolve(dataDir, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile()) return finish(404);
      const range = byteRange(req.headers.range, stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      if (range === null) {
        res.setHeader('Content-Range', 'bytes */' + stat.size);
        return finish(416);
      }
      res.setHeader('Content-Type', mediaTypes[relative.split('.').pop()]);
      res.setHeader('Content-Length', range ? range.end - range.start + 1 : stat.size);
      if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.writeHead(range ? 206 : 200);
      if (req.method === 'HEAD' || !stat.size) return res.end();
      await pipeline(file.createReadStream({ ...range, autoClose: false }), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.destroy();
      } else {
        finish(['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code) ? 404 : 500);
      }
    } finally {
      if (file) await file.close().catch(() => {});
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const pem = await readFile(process.env.MANUAL_PUBLIC_KEY || '/run/manual/public.pem', 'utf8');
  manualServer(process.env.MANUAL_DATA || '/data', pem).listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
