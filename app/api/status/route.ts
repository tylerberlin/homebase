import { backupStatus } from "@/lib/backupStatus";
import { getStatus } from "@/lib/collector";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = config.backup.mode ? await backupStatus() : getStatus();
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
