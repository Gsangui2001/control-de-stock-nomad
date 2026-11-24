// Staging-only barrier. This branch must not be merged with this file in place.
// The protected preview serves UI assets, while the browser QA fixture supplies
// synthetic API responses. Requests can never reach live reservations or send routes.
import { NextResponse } from "next/server";
export function middleware() {
  return NextResponse.json({error:"Vista de prueba aislada. Sin acceso al sistema real."},
    {status:403,headers:{"Cache-Control":"no-store"}});
}
export const config = {matcher:["/api/:path*"]};
