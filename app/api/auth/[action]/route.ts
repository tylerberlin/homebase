import { timingSafeEqual, createHash } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { addPasskey, findPasskey, listPasskeys, ORIGIN, RP_ID, RP_NAME, saveChallenge, takeChallenge, updateCounter } from "@/lib/auth/passkeys";
import { checkPassword, clearFailures, clientId, hasPassword, lockedOut, MIN_LENGTH, recordFailure, setPassword } from "@/lib/auth/password";
import { COOKIE, cookieOptions, createSession, renewSession, verifySession } from "@/lib/auth/session";
import { hasStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Login API: GET status; POST setup, login, logout, touch (still here: renews the idle timer),
// passkey-register-options, passkey-register, passkey-login-options, passkey-login.

const json = (v: unknown, status = 200) => NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin).host;
    return o === host || o === RP_ID;
  } catch {
    return false;
  }
}

const cookieValue = (req: Request) => /(?:^|;\s*)bd_session=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];

async function loggedIn(req: Request, res: NextResponse, method: "password" | "passkey") {
  res.cookies.set(COOKIE, await createSession(method), cookieOptions(req));
  return res;
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== "status") return json({ error: "not found" }, 404);
  if (!hasStore()) return json({ error: "storage not connected" }, 503);
  const [pw, keys, signedIn] = await Promise.all([hasPassword(), listPasskeys(), verifySession(cookieValue(req))]);
  return json({ setup: !pw, passkeys: keys.length, signedIn, passkeyOrigin: ORIGIN, minLength: MIN_LENGTH });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const action = (await params).action;
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  if (!hasStore()) return json({ error: "storage not connected" }, 503);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const client = clientId(req);

  switch (action) {
    case "setup": {
      // First run only: needs the one-time setup code from the server settings.
      if (await hasPassword()) return json({ error: "already set up" }, 409);
      const code = process.env.AUTH_SETUP_CODE ?? "";
      if (await lockedOut(client)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      if (!code || typeof body.code !== "string" || !same(body.code.trim(), code)) {
        await recordFailure(client);
        return json({ error: "That setup code isn't right." }, 401);
      }
      const pw = typeof body.password === "string" ? body.password : "";
      if (pw.length < MIN_LENGTH) return json({ error: `Use at least ${MIN_LENGTH} characters.` }, 400);
      await setPassword(pw);
      return loggedIn(req, json({ ok: true }), "password");
    }

    case "login": {
      const wait = await lockedOut(client);
      if (wait) return json({ error: `Too many wrong attempts. Try again in ${wait} minutes.` }, 429);
      if (typeof body.password !== "string" || !(await checkPassword(body.password))) {
        await recordFailure(client);
        return json({ error: "Wrong password." }, 401);
      }
      await clearFailures(client);
      return loggedIn(req, json({ ok: true }), "password");
    }

    case "logout": {
      const res = json({ ok: true });
      res.cookies.set(COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
      return res;
    }

    case "touch": {
      if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== "production") return json({ ok: true }); // dev without login
      const token = await renewSession(cookieValue(req));
      if (!token) return json({ error: "signed out" }, 401);
      const res = json({ ok: true });
      res.cookies.set(COOKIE, token, cookieOptions(req));
      return res;
    }

    case "passkey-register-options": {
      if (!(await verifySession(cookieValue(req)))) return json({ error: "sign in first" }, 401);
      const existing = await listPasskeys();
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: "owner",
        userDisplayName: "Homebase",
        userID: new TextEncoder().encode("homebase-owner"),
        attestationType: "none",
        excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      await saveChallenge("reg", options.challenge);
      return json(options);
    }

    case "passkey-register": {
      if (!(await verifySession(cookieValue(req)))) return json({ error: "sign in first" }, 401);
      const expected = await takeChallenge("reg");
      if (!expected) return json({ error: "That took too long. Try again." }, 400);
      try {
        const v = await verifyRegistrationResponse({
          response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
          expectedChallenge: expected,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });
        if (!v.verified) return json({ error: "Couldn't verify that passkey." }, 400);
        const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : "Passkey";
        await addPasskey(v.registrationInfo.credential, name);
        return json({ ok: true });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }

    case "passkey-login-options": {
      const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required" });
      await saveChallenge("auth", options.challenge);
      return json(options);
    }

    case "passkey-login": {
      const wait = await lockedOut(client);
      if (wait) return json({ error: `Too many attempts. Try again in ${wait} minutes.` }, 429);
      const response = body.response as Parameters<typeof verifyAuthenticationResponse>[0]["response"];
      const expected = await takeChallenge("auth");
      const credential = response?.id ? await findPasskey(response.id) : undefined;
      if (!expected || !credential) {
        await recordFailure(client);
        return json({ error: "That passkey isn't registered here." }, 401);
      }
      try {
        const v = await verifyAuthenticationResponse({
          response,
          expectedChallenge: expected,
          expectedOrigin: ORIGIN,
          expectedRPID: RP_ID,
          credential,
          requireUserVerification: true,
        });
        if (!v.verified) throw new Error("not verified");
        await updateCounter(credential.id, v.authenticationInfo.newCounter);
        await clearFailures(client);
        return loggedIn(req, json({ ok: true }), "passkey");
      } catch {
        await recordFailure(client);
        return json({ error: "Couldn't verify that passkey." }, 401);
      }
    }
  }
  return json({ error: "not found" }, 404);
}
