import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const port = host.includes(":") ? host.slice(host.lastIndexOf(":") + 1) : "";
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (local || port === "3443" || request.nextUrl.protocol === "https:") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = hostname;
  url.port = "3443";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/call", "/call/:path*"] };
