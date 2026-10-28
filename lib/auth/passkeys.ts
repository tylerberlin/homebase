import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { del, getJson, putJson, putJsonFor } from "../store";

// Face ID / Touch ID / security-key logins (WebAuthn passkeys). Passkeys are tied to the public
// address, so they work on dash.example.com (and on the backup when it stands in for it).

export const RP_ID = process.env.PUBLIC_HOST || "dash.example.com";
export const ORIGIN = `https://${RP_ID}`;
export const RP_NAME = "Homebase";

type Stored = { id: string; publicKey: string; counter: number; transports?: AuthenticatorTransportFuture[]; name: string; added: string };

export async function listPasskeys(): Promise<Stored[]> {
  const [list] = await getJson<Stored[]>("auth:passkeys");
  return list ?? [];
}

export async function addPasskey(c: WebAuthnCredential, name: string) {
  const list = await listPasskeys();
  list.push({ id: c.id, publicKey: Buffer.from(c.publicKey).toString("base64url"), counter: c.counter, transports: c.transports, name, added: new Date().toISOString() });
  await putJson("auth:passkeys", list);
}

export async function findPasskey(id: string): Promise<(WebAuthnCredential & { name: string }) | undefined> {
  const p = (await listPasskeys()).find((x) => x.id === id);
  return p && { id: p.id, publicKey: new Uint8Array(Buffer.from(p.publicKey, "base64url")), counter: p.counter, transports: p.transports, name: p.name };
}

export async function updateCounter(id: string, counter: number) {
  const list = await listPasskeys();
  const p = list.find((x) => x.id === id);
  if (p) {
    p.counter = counter;
    await putJson("auth:passkeys", list);
  }
}

// One pending challenge per purpose, valid for 5 minutes and used once.
export const saveChallenge = (kind: "reg" | "auth", challenge: string) => putJsonFor(`auth:challenge:${kind}`, challenge, 300);
export async function takeChallenge(kind: "reg" | "auth") {
  const [c] = await getJson<string>(`auth:challenge:${kind}`);
  await del(`auth:challenge:${kind}`);
  return c;
}
