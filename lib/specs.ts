import type { HostHardware, NasHardware, PiHardware, Spec } from "./types";

// Turns raw hardware facts into the rows shown in each card's Hardware section.

const MEM_SIZES = [1, 2, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192, 256, 384, 512];

/** Installed RAM as sold (the kernel reports a bit less than the sticks add up to). */
export function memSize(bytes?: number) {
  if (!bytes) return undefined;
  const gib = bytes / 2 ** 30;
  const n = MEM_SIZES.reduce((best, x) => (Math.abs(x - gib) < Math.abs(best - gib) ? x : best));
  return `${n} GB`;
}

/** Drive capacity the way it's printed on the label (decimal units). */
export function driveSize(bytes?: number) {
  if (!bytes) return "";
  return bytes >= 1e12 ? `${+(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`;
}

const cleanCpu = (m: string) => m.replace(/\s+\S+-Core Processor$/i, "").replace(/\s+Processor$/i, "").trim();
const cleanVendor = (v: string) =>
  /^ASUSTeK/i.test(v) ? "ASUS" : v.replace(/,?\s*(Co\.,?\s*Ltd\.?|Inc\.?|Corporation|Technology)$/gi, "").trim();
const cleanDrive = (m = "") => m.replace(/_/g, " ").replace(/^WDC /, "WD ").replace(/^(CT\d)/, "Crucial $1").trim();
const cleanGpu = (d: string) => {
  const name = d.match(/\[(.+)\]/)?.[1];
  const vendor = d.split(" ")[0];
  return name ? `${vendor} ${name}` : d.replace(/\s+Corporation/, "");
};
const kernel = (k?: string) => (k ? `Linux ${k.split(/[-+]/)[0]}` : undefined);
const driveKind = (d: { name: string; type?: string }) => (d.name.startsWith("nvme") ? "NVMe SSD" : d.type === "SSD" ? "SSD" : "hard drive");

function push(rows: Spec[], label: string, value?: string, detail?: string, title?: string) {
  if (value) rows.push({ label, value, ...(detail ? { detail } : {}), ...(title ? { title } : {}) });
}

export function nasSpecs(hw: NasHardware | undefined, host: HostHardware, version?: string): Spec[] {
  const rows: Spec[] = [];
  if (hw?.cpu) {
    const cores = hw.physical_cores && hw.cores ? `${hw.physical_cores} cores · ${hw.cores} threads` : undefined;
    push(rows, "CPU", cleanCpu(hw.cpu), cores);
  }
  push(rows, "Memory", memSize(hw?.physmem), hw?.ecc == null ? undefined : hw.ecc ? "ECC" : "non-ECC");
  for (const g of hw?.gpus ?? []) push(rows, "Graphics", cleanGpu(g));
  push(rows, "Motherboard", [host.board_vendor && cleanVendor(host.board_vendor), host.board_name].filter(Boolean).join(" "));

  const drives = hw?.drives ?? [];
  for (const d of drives.filter((d) => d.role === "boot"))
    push(rows, "Boot drive", cleanDrive(d.model) || d.name, `${driveSize(d.size)} ${driveKind(d)}`);
  const pools = new Map<string, typeof drives>();
  for (const d of drives) if (d.role && d.role !== "boot") pools.set(d.role, [...(pools.get(d.role) ?? []), d]);
  for (const [pool, ds] of pools) {
    const same = ds.every((d) => d.size === ds[0].size && driveKind(d) === driveKind(ds[0]));
    const value = same
      ? `${ds.length > 1 ? `${ds.length} × ` : ""}${driveSize(ds[0].size)} ${driveKind(ds[0])}${ds.length > 1 ? "s" : ""}`
      : ds.map((d) => driveSize(d.size)).join(" + ");
    push(rows, `Pool ${pool}`, value, ds[0].pool_layout?.toLowerCase(), ds.map((d) => cleanDrive(d.model)).join(", "));
  }
  for (const d of drives.filter((d) => !d.role)) push(rows, "Unused drive", cleanDrive(d.model) || d.name, `${driveSize(d.size)} ${driveKind(d)}`);

  push(rows, "OS", version ? `TrueNAS ${version}` : undefined, kernel(host.kernel));
  return rows;
}

export function piSpecs(hw: PiHardware | undefined): Spec[] {
  const rows: Spec[] = [];
  if (!hw) return rows;
  const [board, rev] = (hw.model ?? "").split(/\s+Rev\s+/);
  push(rows, /Raspberry|Model B|Zero/.test(board) ? "Board" : "Model", board, rev ? `Rev ${rev}` : undefined);
  const cpuDetail = [hw.cores && `${hw.cores} cores`, hw.cpu_max_mhz && `${+(hw.cpu_max_mhz / 1000).toFixed(1)} GHz`].filter(Boolean).join(" · ");
  push(rows, "CPU", hw.cpu, cpuDetail || undefined);
  push(rows, "Memory", memSize(hw.mem_total));
  push(rows, "Storage", hw.disk_size ? `${driveSize(hw.disk_size)} ${hw.disk_type ?? "drive"}` : undefined);
  push(rows, "OS", hw.os?.replace(" GNU/Linux", ""), kernel(hw.kernel));
  return rows;
}

/** A server card without TrueNAS: what Node and /sys can tell about this machine. */
export function hostSpecs(cpu: { model?: string; threads: number }, memBytes: number, host: HostHardware, osName: string): Spec[] {
  const rows: Spec[] = [];
  push(rows, "CPU", cpu.model ? cleanCpu(cpu.model) : undefined, `${cpu.threads} threads`);
  push(rows, "Memory", memSize(memBytes));
  push(rows, "Motherboard", [host.board_vendor && cleanVendor(host.board_vendor), host.board_name].filter(Boolean).join(" "));
  push(rows, "OS", osName.replace(" GNU/Linux", ""), kernel(host.kernel));
  return rows;
}

/** A Proxmox node, from /nodes/{node}/status. */
export function proxmoxSpecs(st: { cpuinfo?: { model?: string; cpus?: number; cores?: number; sockets?: number }; memory?: { total?: number }; pveversion?: string; kversion?: string }): Spec[] {
  const rows: Spec[] = [];
  const c = st.cpuinfo;
  const cores = c?.cores && c.sockets ? c.cores * c.sockets : undefined;
  push(rows, "CPU", c?.model ? cleanCpu(c.model) : undefined, [cores && `${cores} cores`, c?.cpus && `${c.cpus} threads`].filter(Boolean).join(" · ") || undefined);
  push(rows, "Memory", memSize(st.memory?.total));
  const pve = st.pveversion?.match(/pve-manager\/([\d.]+)/)?.[1];
  push(rows, "OS", pve ? `Proxmox VE ${pve}` : undefined, kernel(st.kversion?.match(/Linux (\S+)/)?.[1]));
  return rows;
}
