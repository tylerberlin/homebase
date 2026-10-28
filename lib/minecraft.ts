import net from "node:net";
import type { MinecraftStatus } from "./types";

// Minecraft Server List Ping (1.7+ protocol).

function varint(n: number): Buffer {
  const out: number[] = [];
  n >>>= 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}

/** Returns [value, bytesRead], or null if the buffer doesn't hold a full varint yet. */
function readVarint(buf: Buffer, off: number): [number, number] | null {
  let num = 0;
  for (let i = 0; i < 5; i++) {
    if (off + i >= buf.length) return null;
    const b = buf[off + i];
    num |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return [num, i + 1];
  }
  throw new Error("bad varint");
}

type Chat = string | { text?: string; extra?: Chat[] } | Chat[];

function plain(desc: Chat | undefined): string {
  const text =
    typeof desc === "string"
      ? desc
      : Array.isArray(desc)
        ? desc.map(plain).join("")
        : desc && typeof desc === "object"
          ? (desc.text ?? "") + (desc.extra ?? []).map(plain).join("")
          : "";
  return text.replace(/§./g, "");
}

export function minecraftStatus(host: string, port: number, timeout = 4000): Promise<MinecraftStatus> {
  const start = Date.now();
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (r: MinecraftStatus) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(r);
    };
    const fail = (e: Error | string) => finish({ online: false, error: typeof e === "string" ? e : e.message || e.name });

    const sock = net.connect({ host, port, timeout });
    sock.on("connect", () => {
      const h = Buffer.from(host);
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      const hs = Buffer.concat([Buffer.from([0x00]), varint(767), varint(h.length), h, portBuf, varint(1)]);
      sock.write(Buffer.concat([varint(hs.length), hs, Buffer.from([0x01, 0x00])]));
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const len = readVarint(buf, 0);
        if (!len) return;
        const id = readVarint(buf, len[1]);
        if (!id) return;
        const strLen = readVarint(buf, len[1] + id[1]);
        if (!strLen) return;
        const startAt = len[1] + id[1] + strLen[1];
        if (buf.length < startAt + strLen[0]) return;
        const info = JSON.parse(buf.subarray(startAt, startAt + strLen[0]).toString("utf8"));
        const players = info.players ?? {};
        finish({
          online: true,
          players_online: players.online ?? 0,
          players_max: players.max ?? 0,
          players: (players.sample ?? []).map((p: { name: string }) => p.name),
          version: info.version?.name ?? "",
          motd: plain(info.description).trim(),
          ping_ms: Date.now() - start,
          favicon: typeof info.favicon === "string" && info.favicon.startsWith("data:image/") ? info.favicon : undefined,
        });
      } catch (e) {
        fail(e as Error);
      }
    });
    sock.on("timeout", () => fail("timed out"));
    sock.on("error", fail);
    sock.on("close", () => fail("connection closed"));
  });
}
