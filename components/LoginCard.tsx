"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import { KeyIcon } from "./icons";

// The sign-in page: Face ID / Touch ID (passkey) first, password as the fallback. On first run it
// asks for the one-time setup code and a new password, then offers to add a passkey.

type Status = { setup: boolean; passkeys: number; signedIn: boolean; passkeyOrigin: string; minLength: number };
type Step = "loading" | "setup" | "login" | "enroll" | "error";

const post = async (action: string, body: object = {}) => {
  const r = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d;
};

const ENROLLED = "bd-passkey-here";

export default function LoginCard({ next }: { next: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [passkeyHere, setPasskeyHere] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        // Passkeys belong to the public address and need https.
        setPasskeyHere(browserSupportsWebAuthn() && window.location.origin === s.passkeyOrigin);
        if (s.signedIn) window.location.replace(next);
        else setStep(s.setup ? "setup" : "login");
      })
      .catch(() => setStep("error"));
  }, [next]);

  const done = () => window.location.replace(next);
  const afterPassword = () => {
    let skip = false;
    try {
      skip = localStorage.getItem(ENROLLED) === "1";
    } catch {}
    if (passkeyHere && !skip) setStep("enroll");
    else done();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      // The browser's own "cancelled" errors aren't worth shouting about.
      setError(/NotAllowed|AbortError|timed out|cancel/i.test(msg) ? null : msg);
    } finally {
      setBusy(false);
    }
  };

  const passkeyLogin = () =>
    run(async () => {
      const options = await post("passkey-login-options");
      const response = await startAuthentication({ optionsJSON: options });
      await post("passkey-login", { response });
      done();
    });

  const enroll = () =>
    run(async () => {
      const options = await post("passkey-register-options");
      const response = await startRegistration({ optionsJSON: options });
      const name = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone / iPad" : /Mac/.test(navigator.userAgent) ? "Mac" : /Android/.test(navigator.userAgent) ? "Android" : "This device";
      await post("passkey-register", { response, name });
      try {
        localStorage.setItem(ENROLLED, "1");
      } catch {}
      done();
    });

  return (
    <main className="login-wrap">
      <section className="card login-card" aria-labelledby="login-title">
        <span className="login-logo"><BrandMark size={56} /></span>
        <h1 id="login-title">Homebase</h1>

        {step === "loading" && <p className="login-sub">Checking…</p>}
        {step === "error" && <p className="login-sub err">Can&apos;t reach the login service. Refresh to try again.</p>}

        {step === "setup" && (
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw !== pw2) return setError("The passwords don't match.");
              void run(async () => {
                await post("setup", { code, password: pw });
                afterPassword();
              });
            }}
          >
            <p className="login-sub">Create your password. You&apos;ll need the one-time setup code.</p>
            <input className="field" placeholder="Setup code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required aria-label="Setup code" />
            <input className="field" type="password" placeholder={`New password (${status?.minLength ?? 10}+ characters)`} value={pw} minLength={status?.minLength ?? 10} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required aria-label="New password" />
            <input className="field" type="password" placeholder="Same password again" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required aria-label="Confirm password" />
            <button className="btn login-btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create password"}
            </button>
          </form>
        )}

        {step === "login" && (
          <>
            {passkeyHere && (status?.passkeys ?? 0) > 0 && (
              <>
                <button type="button" className="btn login-btn passkey-btn" onClick={passkeyLogin} disabled={busy}>
                  <KeyIcon /> Sign in with Face ID / Touch ID
                </button>
                <div className="login-or">
                  <span>or use your password</span>
                </div>
              </>
            )}
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await post("login", { password: pw });
                  afterPassword();
                });
              }}
            >
              {/* hidden username helps password managers file this login */}
              <input type="text" name="username" value="owner" autoComplete="username" readOnly hidden />
              <input className="field" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required aria-label="Password" autoFocus={!passkeyHere} />
              <button className={`btn login-btn ${passkeyHere && (status?.passkeys ?? 0) > 0 ? "secondary" : ""}`} type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        )}

        {step === "enroll" && (
          <div className="login-form">
            <p className="login-sub">Sign in faster next time with Face ID or Touch ID on this device.</p>
            <button type="button" className="btn login-btn passkey-btn" onClick={enroll} disabled={busy}>
              <KeyIcon /> Add Face ID / Touch ID
            </button>
            <button
              type="button"
              className="btn login-btn secondary"
              onClick={() => {
                try {
                  localStorage.setItem(ENROLLED, "1");
                } catch {}
                done();
              }}
            >
              Not now
            </button>
          </div>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
