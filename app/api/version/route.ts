import { checkForUpdate } from "@/lib/updates";

export const dynamic = "force-dynamic";

// This copy's version, and the newer release on GitHub if there is one.
export async function GET() {
  return Response.json(await checkForUpdate(), { headers: { "Cache-Control": "no-store" } });
}
