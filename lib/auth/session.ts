import { jwtVerify, SignJWT } from "jose";

// The login cookie: a signed token (HS256) that says "the owner logged in", valid 30 days at most
// and only while in use: it records when you last did something (`act`), and is refused after
// IDLE_MINUTES without activity. Background refreshes don't count; the page renews it through
// /api/auth/touch when you actually click, type or scroll (lib/useIdleLogout.ts).
// NAS and the Vercel backup share SESSION_SECRET, so a login works on both.

export const COOKIE = "bd_session";
export const SESSION_DAYS = 30;
export const IDLE_MINUTES = 15;
const IDLE_GRACE = 60; // seconds: the page renews at most once a minute

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
};

type Method = "password" | "passkey";
const nowSec = () => Math.floor(Date.now() / 1000);

function sign(method: Method, exp: number | string) {
  return new SignJWT({ m: method, act: nowSec() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret());
}

export const createSession = (method: Method) => sign(method, `${SESSION_DAYS}d`);

async function readSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.sub !== "owner" || typeof payload.act !== "number") return null;
    if (nowSec() - payload.act > IDLE_MINUTES * 60 + IDLE_GRACE) return null;
    return payload as typeof payload & { m: Method; act: number; exp: number };
  } catch {
    return null;
  }
}

export const verifySession = async (token: string | undefined) => !!(await readSession(token));

/** A fresh token with the activity time reset; keeps the original 30-day end. Null if signed out. */
export async function renewSession(token: string | undefined) {
  const s = await readSession(token);
  return s ? sign(s.m, s.exp) : null;
}

/** Cookie options: Secure on https (dash.example.com), not on the plain-http Tailscale address. */
export function cookieOptions(req: Request) {
  const https = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  return { httpOnly: true, secure: https, sameSite: "lax" as const, path: "/", maxAge: IDLE_MINUTES * 60 + IDLE_GRACE };
}
