export type HostStats = {
  hostname?: string;
  cores?: number;
  cpu_percent?: number;
  temp_c?: number;
  mem_total?: number;
  mem_used?: number;
  disk_total?: number;
  disk_used?: number;
  uptime_seconds?: number;
  load?: number[];
};

export type Pool = {
  name: string;
  status?: string;
  healthy?: boolean;
  size?: number;
  allocated?: number;
};

/** An app, VM or container on a server. Only name and state are required; the rest shows in its details. */
export type App = {
  name: string;
  state?: string;
  kind?: string; // "VM", "CT", "Docker", "App"
  id?: string | number;
  cpu_percent?: number;
  mem_used?: number;
  mem_total?: number;
  uptime_seconds?: number;
  image?: string; // Docker image, or an app's version
  note?: string; // something worth knowing: "update available", "unhealthy", "paused"
  tags?: string; // labels from Proxmox, e.g. "media, prod"
};

/** Raw hardware facts; lib/specs.ts turns them into display rows. */
export type Drive = { name: string; model?: string; size?: number; type?: string; role?: string; pool_layout?: string };
export type NasHardware = { cpu?: string; cores?: number; physical_cores?: number; physmem?: number; ecc?: boolean; gpus?: string[]; drives?: Drive[] };
export type HostHardware = { board_vendor?: string; board_name?: string; kernel?: string };
/** What the stats agent reports about its machine (a Pi, a PC, a Mac...). */
export type PiHardware = { model?: string; cpu?: string; cores?: number; cpu_max_mhz?: number; mem_total?: number; disk_size?: number; disk_type?: string; os?: string; kernel?: string };
export type AgentPlatform = { system?: "linux" | "darwin" | "windows"; os?: string; is_pi?: boolean };
export type Spec = { label: string; value: string; detail?: string; title?: string };
export type Alert = { level?: string; text?: string };

export type TrueNASInfo = {
  error?: string;
  version?: string;
  hostname?: string;
  pools?: Pool[];
  apps?: App[];
  apps_error?: string;
  alerts?: Alert[];
  hardware?: NasHardware;
};

export type MinecraftStatus = {
  online: boolean;
  players_online?: number;
  players_max?: number;
  players?: string[];
  version?: string;
  motd?: string;
  ping_ms?: number;
  favicon?: string | null; // collector: data: URL from the ping; /api/status: a /api/mc-icon/... URL
  error?: string;
};

export type Mod = {
  file: string;
  name: string;
  version: string;
  description?: string;
  icon?: string; // Modrinth's icon URL
  url?: string; // the mod's Modrinth page
  client?: "required" | "optional" | "unsupported"; // do players need it installed to join?
  update?: { version: string; url: string };
  disabled?: boolean; // file renamed to .jar.disabled
};
export type ModList = { loader?: string; mods: Mod[]; error?: string };

export type Minecraft = MinecraftStatus & { label: string; address: string; mods?: ModList | null };

export type Weather = { temp: number; code: number; is_day: boolean; high?: number; low?: number; unit: "F" | "C" };

export type Server = {
  id: string;
  name: string;
  location: string;
  /** truenas: TrueNAS over its API. host: the machine Homebase runs on, without TrueNAS. pi / agent: a
   *  machine running the stats agent. proxmox: a Proxmox VE node over its API. */
  kind: "truenas" | "host" | "pi" | "agent" | "proxmox";
  platform?: string; // the tag on the card: "TrueNAS", "Ubuntu 24.04", "Raspberry Pi 5", "Proxmox VE 8.2"
  reachable: boolean;
  error?: string;
  stats: HostStats;
  cpu_history: number[];
  truenas?: TrueNASInfo;
  storage?: Pool[]; // storage on servers other than TrueNAS (Proxmox storages)
  apps?: App[]; // apps on servers other than TrueNAS: Docker containers, Proxmox VMs and containers
  appsLabel?: string; // heading for apps, e.g. "Containers"
  web_url?: string; // optional link to the machine's own web UI
  specs?: Spec[];
  tz?: string; // IANA time zone, for the local clock
  weather?: Weather;
  minecraft: Minecraft | null;
};

export type Link = { name: string; url: string; up: boolean; code?: number; ms?: number; error?: string };

export type Status = {
  updated: number | null;
  /** Set on the backup site: when each server last reported in (unix seconds). */
  backup?: { nas?: number; pi?: number };
  refresh?: number;
  servers: Server[];
  links: Link[];
};
