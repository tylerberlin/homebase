import { calendarData } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await calendarData(), { headers: { "Cache-Control": "no-store" } });
}
