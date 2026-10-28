import { nasSpecs, piSpecs } from "./specs";
import type { Status } from "./types";

const GiB = 2 ** 30, TiB = 2 ** 40;
const hist = (base: number, jitter: number) =>
  Array.from({ length: 60 }, (_, i) => Math.max(1, Math.min(100, base + Math.sin(i / 5) * jitter + Math.random() * jitter)));

export type DemoVariant = "normal" | "issues" | "stale" | "nomc";

/** Sample data for ?demo. ?demo=issues shows problem states; ?demo=stale shows old data; ?demo=nomc has no Minecraft servers. */
export function demoStatus(variant: DemoVariant = "normal"): Status {
  const s = healthy();
  if (variant === "stale") s.updated! -= 150;
  if (variant === "nomc") s.servers.forEach((x) => (x.minecraft = null));
  if (variant === "issues") {
    const [nas, pi] = s.servers;
    nas.stats.temp_c = 88;
    nas.truenas!.apps![2].state = "CRASHED";
    nas.truenas!.apps![3].state = "STOPPED";
    nas.truenas!.alerts!.unshift({ level: "WARNING", text: "Device /dev/sdb has 8 unreadable sectors (SMART)." });
    s.servers[1] = { ...pi, reachable: false, error: "can't reach Pi: connect ETIMEDOUT 100.64.0.2:9100", stats: {},
      minecraft: { ...pi.minecraft!, online: false, error: "Pi unreachable" } };
  }
  return s;
}

function healthy(): Status {
  return {
    updated: Math.floor(Date.now() / 1000),
    refresh: 10,
    servers: [
      {
        id: "nas", name: "NAS", location: "New York", kind: "truenas", reachable: true,
        tz: "America/New_York", weather: { temp: 58, code: 2, is_day: true, high: 63, low: 47, unit: "F" },
        stats: { cpu_percent: 23.4, cores: 12, temp_c: 51, mem_used: 14.2 * GiB, mem_total: 32 * GiB, uptime_seconds: 1094400, load: [1.42, 1.31, 1.18] },
        cpu_history: hist(18, 8),
        truenas: {
          version: "25.04.2",
          pools: [{ name: "tank", status: "ONLINE", healthy: true, size: 3.63 * TiB, allocated: 0.74 * TiB }],
          apps: ["homebase", "cloudflared", "minecraft", "nextcloud"].map((name) => ({ name, state: "RUNNING" })),
          alerts: [{ level: "INFO", text: "Scrub of pool tank finished." }],
        },
        specs: nasSpecs(
          { cpu: "AMD Ryzen 5 5600 6-Core Processor", cores: 12, physical_cores: 6, physmem: 31.26 * GiB, ecc: false,
            gpus: ["NVIDIA Corporation GA106 [GeForce RTX 3060]"],
            drives: [
              { name: "nvme0n1", model: "Samsung SSD 980 500GB", size: 500107862016, type: "SSD", role: "boot" },
              { name: "sda", model: "WDC_WD40EFPX-68C6CN0", size: 4000787030016, type: "HDD", role: "tank", pool_layout: "MIRROR" },
              { name: "sdb", model: "WDC_WD40EFPX-68C6CN1", size: 4000787030016, type: "HDD", role: "tank", pool_layout: "MIRROR" },
            ] },
          { board_vendor: "Gigabyte Technology Co., Ltd.", board_name: "B550M DS3H", kernel: "6.12.105-production+truenas" },
          "25.04.2",
        ),
        minecraft: { label: "Modded · Create", address: "mc.example.com", online: true, players_online: 2, players_max: 20, players: ["Alex", "Steve"], version: "NeoForge 1.21.1", motd: "Create + Steam \x27n\x27 Rails", ping_ms: 3,
          mods: {
            loader: "NeoForge 1.21.1",
            mods: [
              { file: "create.jar", name: "Create", version: "6.0.10", description: "Aesthetic technology that empowers the player", url: "https://modrinth.com/mod/create", client: "required", icon: "https://cdn.modrinth.com/data/LNytGWDc/icon.png" },
              { file: "railways.jar", name: "Create: Steam 'n' Rails", version: "0.3.0-beta.2", description: "Adding depth to Create's rail network", client: "required", update: { version: "0.3.0-beta.3", url: "https://modrinth.com/mod/create-steam-n-rails" } },
              { file: "journeymap.jar", name: "JourneyMap", version: "1.21.1-6.0.9", description: "Real-time mapping in game or in a web browser as you explore.", client: "optional" },
              { file: "lithium.jar", name: "Lithium", version: "0.15.4", description: "No-compromises game logic optimization mod", client: "optional" },
            ],
          } },
      },
      {
        id: "pi", name: "pi", location: "Seattle", kind: "pi", reachable: true,
        tz: "America/Los_Angeles", weather: { temp: 61, code: 0, is_day: true, high: 85, low: 72, unit: "F" },
        stats: { cpu_percent: 9.1, cores: 4, temp_c: 54.3, mem_used: 2.9 * GiB, mem_total: 8 * GiB, disk_used: 38 * GiB, disk_total: 117 * GiB, uptime_seconds: 302400, load: [0.38, 0.41, 0.36] },
        cpu_history: hist(8, 5),
        specs: piSpecs({ model: "Raspberry Pi 5 Model B Rev 1.1", cpu: "Arm Cortex-A76", cores: 4, cpu_max_mhz: 2400, mem_total: 7.87 * GiB,
          disk_size: 31914983424, disk_type: "microSD", os: "Debian GNU/Linux 13 (trixie)", kernel: "6.12.75+rpt-rpi-2712" }),
        minecraft: { label: "Survival World", address: "", online: true, players_online: 0, players_max: 20, players: [], version: "1.21.10", motd: "Survival World", ping_ms: 41 },
      },
    ],
    links: [{ name: "Cloud", url: "https://cloud.example.com", up: true, code: 200, ms: 184 }],
  };
}
