import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { currentUser } from "./app/auth";

const PUBLIC = ["/login", "/api/auth/login", "/favicon.svg", "/og.png"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.includes(path) || path.startsWith("/_next/")) return NextResponse.next();
  const user = await currentUser(request);
  if (!user) {
    if (path.startsWith("/api/")) return Response.json({ error: "Authentication required" }, { status: 401 });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (path.startsWith("/admin/") && user.role !== "admin") return NextResponse.redirect(new URL("/account", request.url));
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
