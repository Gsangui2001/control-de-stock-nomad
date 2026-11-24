import { createHmac, createPrivateKey, createPublicKey, sign } from 'node:crypto';

function signingKey() {
  const secret = process.env.BOAT_CONTROL_SERVER_SECRET;
  if (!secret) throw new Error('Manual signing unavailable');
  const seed = createHmac('sha256', secret).update('nomad-a-bordo/media-origin-signing/v1', 'utf8').digest();
  // RFC 8410 PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  return createPrivateKey({ key: pkcs8, type: 'pkcs8', format: 'der' });
}

export function manualPublicKey() {
  return createPublicKey(signingKey()).export({ type: 'spki', format: 'pem' });
}

export function manualOrigin() {
  const value = process.env.BOAT_MANUAL_MEDIA_ORIGIN;
  if (!value) return null;
  const origin = new URL(value);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port ||
      origin.search || origin.hash || origin.pathname !== '/' || (value !== origin.origin && value !== origin.origin + '/')) {
    throw new Error('Invalid private manual origin');
  }
  return origin.origin;
}

export function signedManualUrl(origin: string, pathname: string, grantExpires: number) {
  const exp = String(Math.min(Math.floor(Date.now() / 1000) + 300, grantExpires));
  const message = Buffer.from('nomad-manual-v1\n' + pathname + '\n' + exp, 'utf8');
  const url = new URL(pathname, origin);
  url.searchParams.set('exp', exp);
  url.searchParams.set('sig', sign(null, message, signingKey()).toString('base64url'));
  return url;
}
