import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "./lib/auth/session";

// Every page and data feed requires the owner's login (lib/auth). Open without it: the login page
// and its API, the servers' report endpoint (it has its own token), the health check, and the
// app icons/manifest (needed to draw the login page and the home-screen icon).

const OPEN = [/^\/login$/, /^\/api\/auth\//, /^\/api\/push$/, /^\/healthz$/, /^\/brand\//, /^\/manifest\.webmanifest$/, /^\/favicon\.ico$/, /^\/sw\.js$/];

const PUBLIC_HOST = process.env.PUBLIC_HOST || "dash.example.com";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // The public address must never be used over plain http (the password would travel unencrypted).
  // Cloudflare tells us the visitor's scheme; the Tailscale address is already encrypted by Tailscale.
  const host = req.headers.get("host") ?? "";
  if (host === PUBLIC_HOST && req.headers.get("x-forwarded-proto") === "http") {
    return NextResponse.redirect(`https://${PUBLIC_HOST}${path}${req.nextUrl.search}`, 301);
  }
  if (OPEN.some((r) => r.test(path))) return NextResponse.next();
  // Local development without a session secret: let the page through so ?demo keeps working.
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== "production") return NextResponse.next();

  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();

  if (path.startsWith("/api/")) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  // Show the login page at the requested address (no redirect, so it works the same through the
  // tunnel, on Tailscale and on the backup); after signing in it reloads the page that was asked for.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
  const res = NextResponse.rewrite(url);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
