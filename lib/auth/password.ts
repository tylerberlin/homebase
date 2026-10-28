import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { bump, count, del, getJson, putJson } from "../store";

// The owner's password: scrypt-hashed in the shared store. Wrong attempts are rate-limited per
// client and overall, so guessing is impractical.

const run = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
type Hash = { salt: string; hash: string };

export const MIN_LENGTH = 10;
const LIMIT_PER_CLIENT = 8; // wrong attempts per 15 minutes from one address
const LIMIT_TOTAL = 30; // wrong attempts per 15 minutes from everywhere
const WINDOW = 15 * 60;

export async function hasPassword() {
  const [h] = await getJson<Hash>("auth:password");
  return !!h;
}

export async function setPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await run(pw, salt, 32, PARAMS);
  await putJson("auth:password", { salt: salt.toString("base64"), hash: hash.toString("base64") } satisfies Hash);
}

export async function checkPassword(pw: string) {
  const [h] = await getJson<Hash>("auth:password");
  if (!h) return false;
  const got = await run(pw, Buffer.from(h.salt, "base64"), 32, PARAMS);
  return timingSafeEqual(got, Buffer.from(h.hash, "base64"));
}

export const clientId = (req: Request) =>
  (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();

/** Null if allowed, otherwise how many minutes to wait. */
export async function lockedOut(client: string) {
  const [mine, all] = await Promise.all([count(`auth:fail:${client}`), count("auth:fail:all")]);
  return mine >= LIMIT_PER_CLIENT || all >= LIMIT_TOTAL ? Math.ceil(WINDOW / 60) : null;
}

export async function recordFailure(client: string) {
  await Promise.all([bump(`auth:fail:${client}`, WINDOW), bump("auth:fail:all", WINDOW)]);
}

export const clearFailures = (client: string) => del(`auth:fail:${client}`);
