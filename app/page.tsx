import Dashboard from "@/components/Dashboard";
import { config } from "@/lib/config";
import { PrefsProvider } from "@/lib/prefs";
import { defaultSettings, getSettings } from "@/lib/settingsStore";
import { hasStore } from "@/lib/store";

// Shortcuts shown in ?demo when none are configured.
const DEMO_LINKS = [
  { name: "TrueNAS", url: "https://truenas.local" }, { name: "Cloud", url: "https://cloud.example.com" },
  { name: "Cloudflare", url: "https://dash.cloudflare.com" }, { name: "Vercel", url: "https://vercel.com/dashboard" },
  { name: "Tailscale", url: "https://login.tailscale.com/admin/machines" },
];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  // Open with ?demo to preview the layout with sample data (?demo=issues or ?demo=stale for problem states).
  // ?display opens the full-screen room display.
  const params = await searchParams;
  const raw = params.demo;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const demo = v == null ? null : v === "issues" || v === "stale" || v === "nomc" || v === "noservers" || v === "many" ? v : "normal";
  const settings = demo ? defaultSettings() : await getSettings();
  return (
    <PrefsProvider initial={settings} saved={hasStore()} demo={!!demo}>
      <Dashboard demo={demo} display={params.display != null} quickLinks={demo && !config.quickLinks.length ? DEMO_LINKS : config.quickLinks} />
    </PrefsProvider>
  );
}
