import { manualPublicKey } from '@/lib/boat-manual-signature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    return new Response(manualPublicKey(), { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
