const assert = require('node:assert/strict');
const { createHash, createHmac, createPrivateKey, createPublicKey, verify } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const { beforeEach, after, test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const ts = require('typescript');

const boat = '1'.repeat(32);
const otherBoat = '2'.repeat(32);
const origin = 'https://nomad-media.test';
const prefix = '/a-bordo-media/manual/' + boat;
const cookie = 'x'.repeat(43) + '.' + (Math.floor(Date.now() / 1000) + 86400);
const secret = 'server-test-only';
const item = {
  id: 'proa', title: 'Proa', area: 'Cubierta', description: 'Acceso por proa.',
  photos: [{ sha256: 'a'.repeat(64), caption: 'Registro de proa' }], video: { sha256: 'b'.repeat(64) },
};
const envKeys = ['BOAT_CONTROL_SERVER_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'BOAT_MANUAL_MEDIA_ORIGIN'];
const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let rpc, rpcCalls, storageCalls, manifestResponse, access;

function loadTS(file, requires = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.require = id => requires[id] || require(id);
  compiled._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}
const signer = loadTS('lib/boat-manual-signature.ts');
const grants = loadTS('lib/boat-manual-grant.ts');
const keyRoute = loadTS('app/api/boat/manual-media/key/route.ts', { '@/lib/boat-manual-signature': signer });
const route = loadTS('app/api/boat/manual-media/route.ts', {
  '@/lib/boat-manual-signature': signer,
  '@/lib/boat-manual-grant': grants,
  '@supabase/supabase-js': { createClient() { throw new Error('Manual playback must never use Supabase'); } },
});
const stateRoute = loadTS('app/api/boat/[operation]/route.ts', {
  '@/lib/boat-manual-grant': grants, '@/public/a-bordo/boat-rules.js': {}, '@/lib/boat-push': {},
  '@/lib/boat-crew-state': {}, '@/lib/boat-task-access': {},
  '@supabase/supabase-js': { createClient: () => ({
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return { abortSignal: async () => rpc(args.operation) };
    },
  }) },
});

// The verifier mirrors the origin's documented public-key contract without using the app's signer.
function valid(url, publicKey) {
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  const now = Math.floor(Date.now() / 1000);
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now || Number(exp) > now + 300) return false;
  return verify(null, Buffer.from(['nomad-manual-v1', url.pathname, exp].join('\n')), publicKey, Buffer.from(sig, 'base64url'));
}
function request(query = '', authenticated = true, method = 'GET', session = cookie, value = access) {
  return route.GET(new NextRequest('https://app.test/api/boat/manual-media?boat=' + boat + query, {
    method, headers: authenticated ? { cookie: 'boat_session=' + session + (value ? '; ' + grants.manualGrantCookie + '=' + value : '') } : {},
  }));
}

function stateRequest(operation = 'state', selectedBoat = boat, method = 'GET') {
  const req = new NextRequest('https://app.test/api/boat/' + operation + '?boat=' + selectedBoat, {
    method, headers: { cookie: 'boat_session=' + cookie, 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : '{}',
  });
  return stateRoute[method](req, { params: { operation } });
}
function makeGrant(session = cookie, selectedBoat = boat) {
  const res = NextResponse.json({});
  grants.issueManualGrant(res, session, selectedBoat);
  return res.cookies.get(grants.manualGrantCookie).value;
}

beforeEach(() => {
  process.env.BOAT_CONTROL_SERVER_SECRET = secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rpc.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
  process.env.BOAT_MANUAL_MEDIA_ORIGIN = origin;
  rpc = op => ({ data: op === 'session' ? { user: { id: 'crew', admin: true } } : { state: { boat: {} }, role: 'administrador' }, error: null });
  access = makeGrant();
  rpcCalls = [];
  storageCalls = [];
  manifestResponse = () => Response.json({ version: 1, items: [structuredClone(item)] });
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    storageCalls.push({ url, options });
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, prefix + '/manifest.json');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined);
    assert.ok(valid(url, await keyRoute.GET().text()));
    return manifestResponse(url, options);
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, previous] of Object.entries(oldEnv)) {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('only the domain-separated Ed25519 SPKI public key is exposed for pinning', async () => {
  const response = keyRoute.GET();
  const pem = await response.text();
  assert.equal(response.status, 200);
  assert.equal(createPublicKey(pem).asymmetricKeyType, 'ed25519');
  assert.match(response.headers.get('cache-control'), /no-store/);
  const seed = createHmac('sha256', secret).update('nomad-a-bordo/media-origin-signing/v1').digest();
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  assert.equal(pem, createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }));
  assert.doesNotMatch(pem, /PRIVATE|server-test-only/);
  delete process.env.BOAT_CONTROL_SERVER_SECRET;
  assert.equal(keyRoute.GET().status, 503);
});

test('disabled or malformed origins cannot initiate any catalog or auth request', async () => {
  delete process.env.BOAT_MANUAL_MEDIA_ORIGIN;
  assert.deepEqual(await (await request()).json(), { items: [] });
  assert.equal((await request('&item=proa&asset=video')).status, 404);
  for (const invalid of ['http://private.test', origin + '/path', origin + '?token=x', origin + '#x', 'https://user@private.test', origin + ':8443']) {
    process.env.BOAT_MANUAL_MEDIA_ORIGIN = invalid;
    assert.equal((await request()).status, 503);
  }
  assert.deepEqual(storageCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test('boat state issues the session-only, path-scoped grant after the two existing RPC calls only', async () => {
  const res = await stateRequest();
  const token = res.cookies.get(grants.manualGrantCookie);
  assert.equal(res.status, 200);
  assert.equal(token.httpOnly, true);
  assert.equal(token.secure, true);
  assert.equal(token.sameSite, 'strict');
  assert.equal(token.path, '/api/boat/manual-media');
  assert.equal(token.maxAge, undefined);
  assert.equal(token.expires, undefined);
  assert.equal(grants.verifyManualGrant(token.value, cookie, boat).status, 'ok');
  assert.deepEqual(rpcCalls.map(call => call.args.operation), ['session', 'state_get']);
  assert.equal(rpcCalls[1].args.payload.session, createHash('sha256').update(cookie).digest('hex'));
  rpc = op => op === 'session' ? { data: { user: { id: 'crew', admin: true } } } : { error: { code: '42501', message: 'Denied' } };
  const denied = await stateRequest();
  assert.equal(denied.status, 403);
  assert.equal(denied.cookies.get(grants.manualGrantCookie).maxAge, 0);
});

test('logout removes the session and the path-scoped manual cookie; a boat switch replaces access', async () => {
  const original = (await stateRequest()).cookies.get(grants.manualGrantCookie);
  const switched = (await stateRequest('state', otherBoat)).cookies.get(grants.manualGrantCookie);
  assert.equal(original.name, switched.name);
  assert.equal(original.path, switched.path);
  assert.equal(grants.verifyManualGrant(switched.value, cookie, boat).status, 'denied');
  assert.equal(grants.verifyManualGrant(switched.value, cookie, otherBoat).status, 'ok');
  const logout = await stateRequest('logout', boat, 'POST');
  assert.equal(logout.cookies.get('boat_session').maxAge, 0);
  assert.equal(logout.cookies.get(grants.manualGrantCookie).maxAge, 0);
  assert.equal(logout.cookies.get(grants.manualGrantCookie).path, original.path);
});

test('missing, expired, altered and wrong-user grants cannot access the catalog or a single file', async t => {
  for (const q of ['', '&item=proa&asset=video']) assert.equal((await request(q, false)).status, 401);
  const altered = access.slice(0, -1) + (access.endsWith('A') ? 'B' : 'A');
  for (const q of ['', '&item=proa&asset=video']) {
    const missing = await request(q, true, 'GET', cookie, '');
    assert.equal(missing.status, 428);
    assert.equal((await missing.json()).code, 'manual_boat_refresh');
    for (const [session, token] of [[cookie, altered], [cookie, makeGrant(cookie, otherBoat)], ['other-user-session', access]]) {
      assert.equal((await request(q, true, 'GET', session, token)).status, 403);
    }
  }
  const future = Date.now() + 901000;
  t.mock.method(Date, 'now', () => future);
  assert.equal((await request()).status, 428);
  assert.equal((await request('&item=proa&asset=video')).status, 428);
  assert.deepEqual(storageCalls, []);
  assert.deepEqual(rpcCalls, []);
});

test('signed media cannot outlive the current grant or a known session expiry; legacy sessions still work', async () => {
  const remaining = Math.floor(Date.now() / 1000) + 45;
  const session = 'x'.repeat(43) + '.' + remaining;
  const short = makeGrant(session);
  const res = await request('&item=proa&asset=video', true, 'GET', session, short);
  assert.equal(res.status, 307);
  assert.equal(Number(new URL(res.headers.get('location')).searchParams.get('exp')), remaining);
  assert.equal(Number(storageCalls[0].url.searchParams.get('exp')), remaining);
  const old = 'x'.repeat(43);
  const legacy = makeGrant(old);
  assert.ok(grants.verifyManualGrant(legacy, old, boat).exp <= Math.floor(Date.now() / 1000) + 300);
  assert.equal((await request('', true, 'GET', old, legacy)).status, 200);
  assert.deepEqual(rpcCalls, []);
});

test('authenticated catalog contains app-only links and never forwards the boat cookie', async () => {
  const link = '/api/boat/manual-media?boat=' + boat + '&item=proa&asset=';
  const response = await request();
  assert.deepEqual(await response.json(), { items: [{
    id: 'proa', title: item.title, area: item.area, description: item.description,
    photos: [{ url: link + 'photo-1', caption: item.photos[0].caption }], videoUrl: link + 'video',
  }] });
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(storageCalls.length, 1);
  assert.deepEqual(rpcCalls, []);
  manifestResponse = () => new Response(null, { status: 404 });
  assert.deepEqual(await (await request()).json(), { items: [] });
});

test('invalid selectors, redirects, bad hashes, duplicates, and oversized catalogs fail closed', async () => {
  for (const q of ['&item=proa', '&asset=video', '&item=proa&asset=photo-3', '&item=../else&asset=video']) {
    assert.equal((await request(q)).status, 400);
  }
  assert.deepEqual(storageCalls, []);
  assert.equal((await request('&item=missing&asset=video')).status, 404);
  assert.equal((await request('&item=proa&asset=photo-2')).status, 404);
  for (const invalid of [
    () => Response.redirect('https://another.test/manifest'),
    () => Response.json({ version: 1, items: [item, item] }),
    () => Response.json({ version: 1, items: [{ ...item, video: { sha256: '../else' } }] }),
    () => new Response(' '.repeat(2 * 1024 * 1024 + 1)),
  ]) {
    manifestResponse = invalid;
    assert.equal((await request('&item=proa&asset=video')).status, 503);
  }
});

test('GET and HEAD issue five-minute signatures limited to the exact boat/file/expiry', async () => {
  const pub = await keyRoute.GET().text();
  for (const [asset, method, file] of [
    ['photo-1', 'GET', item.photos[0].sha256 + '.jpg'], ['video', 'GET', item.video.sha256 + '.mp4'], ['video', 'HEAD', item.video.sha256 + '.mp4'],
  ]) {
    const now = Math.floor(Date.now() / 1000);
    const response = await request('&item=proa&asset=' + asset, true, method);
    assert.equal(response.status, 307);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    const url = new URL(response.headers.get('location'));
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, prefix + '/assets/' + file);
    assert.deepEqual([...url.searchParams.keys()], ['exp', 'sig']);
    assert.ok(Number(url.searchParams.get('exp')) >= now + 300);
    assert.ok(valid(url, pub));
    const changed = new URL(url);
    changed.pathname = changed.pathname.replace(boat, otherBoat);
    assert.ok(!valid(changed, pub));
    url.searchParams.set('exp', String(now + 60));
    assert.ok(!valid(url, pub));
    url.searchParams.set('exp', String(now - 1));
    assert.ok(!valid(url, pub));
  }
});

test('a signed origin request returns only the requested video bytes without app credentials', async t => {
  const pub = await keyRoute.GET().text();
  const response = await request('&item=proa&asset=video');
  const destination = new URL(response.headers.get('location'));
  const server = createServer((req, res) => {
    const url = new URL(req.url, origin);
    if (!valid(url, pub) || url.pathname !== prefix + '/assets/' + item.video.sha256 + '.mp4' ||
        req.headers.cookie || req.headers.authorization || req.headers.range !== 'bytes=2-5') return res.writeHead(403).end();
    res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 2-5/10' });
    return res.end('2345');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const local = 'http://127.0.0.1:' + server.address().port + destination.pathname + destination.search;
  const result = await originalFetch(local, { headers: { Range: 'bytes=2-5' } });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await result.text(), '2345');
  assert.equal((await originalFetch(local.split('?')[0])).status, 403);
  assert.equal(storageCalls.length, 1);
});
