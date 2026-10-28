// Changes only from the dashboard page itself (blocks other sites posting here). During a failover
// the Vercel copy answers for the public address under its own host name, so that counts too.

const PUBLIC_HOST = process.env.PUBLIC_HOST || "dash.example.com";

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin).host;
    return o === host || o === PUBLIC_HOST;
  } catch {
    return false;
  }
}
