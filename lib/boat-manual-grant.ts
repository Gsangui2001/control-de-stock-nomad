import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';

export const manualGrantCookie = 'boat_manual_access';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/boat/manual-media' } as const;
const boatId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const lifetime = 15 * 60;

function signature(session: string, boat: string, exp: number) {
  const secret = process.env.BOAT_CONTROL_SERVER_SECRET;
  if (!secret) throw new Error('Manual authorization unavailable');
  return createHmac('sha256', secret).update(['nomad-a-bordo/manual-grant/v1', session, boat, String(exp)].join('\n')).digest('base64url');
}

export function clearManualGrant(response: NextResponse) {
  response.cookies.set(manualGrantCookie, '', { ...cookieOptions, maxAge: 0 });
}

// Only the normal, authenticated state_get flow may call this after boat membership succeeds.
export function issueManualGrant(response: NextResponse, session: string, boat: string) {
  if (!session || !boatId.test(boat)) return clearManualGrant(response);
  const now = Math.floor(Date.now() / 1000);
  const sessionDeadline = /^[A-Za-z0-9_-]{43}\.(\d{10,12})$/.exec(session);
  // Older opaque sessions do not carry their server expiry. Limit them to five minutes.
  const exp = sessionDeadline ? Math.min(now + lifetime, Number(sessionDeadline[1])) : now + 300;
  if (exp <= now) return clearManualGrant(response);
  response.cookies.set(manualGrantCookie, [boat, exp, signature(session, boat, exp)].join('.'), cookieOptions);
}

export function verifyManualGrant(value: string | undefined, session: string, boat: string) {
  if (!value) return { status: 'refresh' } as const;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== boat || !boatId.test(boat) ||
      !/^\d{10,12}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return { status: 'denied' } as const;
  const exp = Number(parts[1]);
  if (!timingSafeEqual(Buffer.from(signature(session, boat, exp)), Buffer.from(parts[2]))) return { status: 'denied' } as const;
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) return { status: 'refresh' } as const;
  if (exp > now + lifetime) return { status: 'denied' } as const;
  return { status: 'ok', exp } as const;
}
