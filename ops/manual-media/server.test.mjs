import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { manualServer } from './server.mjs';

test('private manual files, expiry, isolation, HEAD and byte ranges', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aboard-origin-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const boat = '1'.repeat(32);
  const asset = 'manual/' + boat + '/assets/' + 'a'.repeat(64) + '.mp4';
  const manifest = 'manual/' + boat + '/manifest.json';
  await mkdir(dirname(join(dir, asset)), { recursive: true });
  await writeFile(join(dir, asset), '0123456789');
  await writeFile(join(dir, manifest), '{"items":[]}');
  const app = manualServer(dir, publicKey.export({ format: 'pem', type: 'spki' }));
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    app.closeAllConnections();
    await new Promise(resolve => app.close(resolve));
    await rm(dir, { recursive: true });
  });
  const base = 'http://127.0.0.1:' + app.address().port;
  const signed = (name, seconds = 300) => {
    const path = '/a-bordo-media/' + name;
    const exp = Math.floor(Date.now() / 1000) + seconds;
    const sig = sign(null, Buffer.from(`nomad-manual-v1\n${path}\n${exp}`), privateKey).toString('base64url');
    return `${base}${path}?exp=${exp}&sig=${sig}`;
  };
  const url = signed(asset);
  assert.equal((await fetch(url.split('?')[0])).status, 403);
  assert.equal((await fetch(signed(asset, -1))).status, 403);
  assert.equal((await fetch(signed(asset, 1000))).status, 403);
  assert.equal((await fetch(url.replace(boat, '2'.repeat(32)))).status, 403);
  assert.equal((await fetch(url + '&sig=forged')).status, 403);
  assert.equal((await fetch(signed('manual/' + boat + '/unknown.js'))).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(signed(asset.replace('.mp4', '.jpg')))).status, 404);
  const full = await fetch(url);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(full.headers.get('cache-control'), 'private, no-store');
  assert.equal(await full.text(), '0123456789');
  assert.deepEqual(await (await fetch(signed(manifest))).json(), { items: [] });
  const info = await fetch(url, { method: 'HEAD' });
  assert.equal(info.status, 200);
  assert.equal(info.headers.get('content-length'), '10');
  assert.equal(await info.text(), '');
  for (const [range, text] of [['0-1', '01'], ['-3', '789'], ['8-', '89'], ['9-14', '9']]) {
    const r = await fetch(url, { headers: { Range: 'bytes=' + range } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), text);
  }
  const invalid = await fetch(url, { headers: { Range: 'bytes=10-' } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), 'bytes */10');
});
