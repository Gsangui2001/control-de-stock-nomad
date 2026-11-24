const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const { NextRequest } = require('next/server');
const ts = require('typescript');

const boat = '1'.repeat(32);
const otherBoat = '2'.repeat(32);
const cookie = 'manual-test-session';
const item = {
  id: 'proa', title: 'Proa', area: 'Cubierta', description: 'Acceso por proa.',
  photos: [{ sha256: 'a'.repeat(64), caption: 'Registro de proa' }],
  video: { sha256: 'b'.repeat(64) },
};
const envKeys = ['BOAT_CONTROL_SERVER_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN'];
const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
let rpcResult, manifest, signedUrl, reads, signing, rpcCalls, failRead;

const fakeSupabase = { createClient: () => ({
  rpc(name, args) {
    rpcCalls.push({ name, args });
    return { abortSignal: async () => rpcResult };
  },
}) };

const fakeBlob = {
  async get(pathname, options) {
    reads.push({ pathname, options });
    if (failRead) throw new Error('storage failure');
    if (manifest === null) return null;
    const bytes = Buffer.from(JSON.stringify(manifest));
    return { statusCode: 200, stream: new Response(bytes).body, blob: { size: bytes.length } };
  },
  async issueSignedToken(options) {
    signing.push(options);
    return { delegationToken: 'scoped-delegation', clientSigningToken: 'server-only' };
  },
  async presignUrl(token, options) {
    assert.equal(token.delegationToken, 'scoped-delegation');
    signing.push(options);
    return { presignedUrl: signedUrl };
  },
};

const routeFile = path.resolve(__dirname, '../app/api/boat/manual-media/route.ts');
const route = new Module(routeFile, module);
route.filename = routeFile;
route.require = id => {
  if (id === '@vercel/blob') return fakeBlob;
  if (id === '@supabase/supabase-js') return fakeSupabase;
  return require(id);
};
route._compile(ts.transpileModule(readFileSync(routeFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, routeFile);

const baseUrl = 'http://manual.test/api/boat/manual-media';
function request(query = '', authenticated = true, method = 'GET') {
  const req = new NextRequest(baseUrl + '?boat=' + boat + query, {
    method, headers: authenticated ? { cookie: 'boat_session=' + cookie } : {},
  });
  return route.exports.GET(req);
}

beforeEach(() => {
  process.env.BOAT_CONTROL_SERVER_SECRET = 'rpc-test-only';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rpc.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-only';
  process.env.BLOB_STORE_ID = 'test-store';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  rpcResult = { data: [{ id: boat, name: 'Velero' }], error: null };
  manifest = { version: 1, items: [structuredClone(item)] };
  signedUrl = 'https://private.test/blob?signature=temporary';
  reads = [];
  signing = [];
  rpcCalls = [];
  failRead = false;
});
after(() => {
  for (const key of envKeys) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});

test('checks the real boat session and membership before any catalog or asset access', async () => {
  for (const query of ['', '&item=proa&asset=video']) {
    assert.equal((await request(query, false)).status, 401);
  }
  assert.deepEqual(rpcCalls, []);
  for (const [data, error, expected] of [
    [null, { code: '28000' }, 401], [null, { code: '42501' }, 403],
    [[{ id: otherBoat }], null, 403], [null, { code: 'network_error' }, 503], [null, null, 503],
  ]) {
    rpcResult = { data, error };
    for (const query of ['', '&item=proa&asset=video']) {
      const response = await request(query);
      assert.equal(response.status, expected);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  }
  assert.deepEqual(rpcCalls[0], {
    name: 'boat_control_rpc',
    args: { server_key: 'rpc-test-only', operation: 'boats', payload: {
      session: createHash('sha256').update(cookie).digest('hex'),
    } },
  });
  assert.deepEqual(reads, []);
  assert.deepEqual(signing, []);
});

test('returns empty only for authorized boat with unconfigured store or missing manifest', async () => {
  delete process.env.BLOB_STORE_ID;
  assert.deepEqual(await (await request()).json(), { items: [] });
  assert.equal((await request('&item=proa&asset=video')).status, 404);
  assert.equal(reads.length, 0);
  process.env.BLOB_READ_WRITE_TOKEN = 'test-only';
  manifest = null;
  assert.deepEqual(await (await request()).json(), { items: [] });
  assert.equal((await request('&item=proa&asset=video')).status, 404);
  assert.equal(reads.length, 2);
  failRead = true;
  assert.equal((await request()).status, 503);
});

test('publishes authenticated app links without exposing storage references', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const base = '/api/boat/manual-media?boat=' + boat + '&item=proa&asset=';
  assert.deepEqual(await response.json(), { items: [{
    id: 'proa', title: item.title, area: item.area, description: item.description,
    photos: [{ url: base + 'photo-1', caption: item.photos[0].caption }], videoUrl: base + 'video',
  }] });
  assert.equal(reads[0].pathname, 'manual/' + boat + '/manifest.json');
  assert.equal(reads[0].options.access, 'private');
  assert.equal(reads[0].options.useCache, false);
  assert.equal(signing.length, 0);
});

test('accepts only validated, uniquely identified manifest entries and known asset selectors', async () => {
  for (const query of ['&item=proa', '&asset=video', '&item=proa&asset=photo-3', '&item=../outside&asset=video']) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal((await request('&item=missing&asset=video')).status, 404);
  assert.equal((await request('&item=proa&asset=photo-2')).status, 404);
  manifest.items.push(structuredClone(item));
  assert.equal((await request()).status, 503);
  manifest.items = [structuredClone(item)];
  manifest.items[0].video.sha256 = '../different-boat/asset';
  assert.equal((await request('&item=proa&asset=video')).status, 503);
  assert.deepEqual(signing, []);
});

test('scopes each temporary redirect to a single asset and one HTTP method', async () => {
  for (const [asset, method, filename] of [
    ['photo-1', 'GET', item.photos[0].sha256 + '.jpg'], ['video', 'GET', item.video.sha256 + '.mp4'],
    ['video', 'HEAD', item.video.sha256 + '.mp4'],
  ]) {
    const now = Date.now();
    const response = await request('&item=proa&asset=' + asset, true, method);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), signedUrl);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    const [delegation, signature] = signing.splice(0);
    const pathname = 'manual/' + boat + '/assets/' + filename;
    assert.equal(delegation.pathname, pathname);
    assert.deepEqual(delegation.operations, [method.toLowerCase()]);
    assert.ok(delegation.validUntil >= now + 300000 && delegation.validUntil <= Date.now() + 300000);
    assert.deepEqual(signature, { operation: method.toLowerCase(), access: 'private', pathname, validUntil: delegation.validUntil });
  }
});

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

test('GET with Range survives a cross-origin redirect and retrieves only the requested bytes', async t => {
  const source = Buffer.from('0123456789');
  const cdn = await listen((req, res) => {
    if (req.url !== '/video.mp4?signature=temporary' || req.headers.range !== 'bytes=2-5') {
      res.writeHead(400).end();
      return;
    }
    res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 2-5/10', 'Content-Length': 4 });
    res.end(source.subarray(2, 6));
  });
  t.after(() => new Promise(resolve => cdn.server.close(resolve)));
  signedUrl = cdn.url + '/video.mp4?signature=temporary';
  const app = await listen(async (req, res) => {
    const request = new NextRequest('http://manual.test' + req.url, { headers: req.headers });
    const response = await route.exports.GET(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end();
  });
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const response = await fetch(app.url + '/api/boat/manual-media?boat=' + boat + '&item=proa&asset=video', {
    headers: { cookie: 'boat_session=' + cookie, Range: 'bytes=2-5' },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(await response.text(), '2345');
});
