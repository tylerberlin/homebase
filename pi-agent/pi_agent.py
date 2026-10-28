#!/usr/bin/env python3
"""
Pi stats reporter for Homebase.

Runs on pi. It does NOT host the dashboard; it only answers GET /stats with a small JSON
blob (CPU, temperature, RAM, disk, uptime, hardware, and the local Minecraft server's status, if MC_PORT is set).
NAS fetches it over Tailscale every few seconds.

Standard library only. Requires the token from PI_AGENT_TOKEN on every request.

If BACKUP_PUSH_URL and BACKUP_PUSH_TOKEN are set, it also sends the same report to the backup
site every 30 s, so the backup still shows the Pi when NAS is down.
"""
import json
import os
import re
import shutil
import socket
import struct
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("PI_AGENT_TOKEN", "")
PORT = int(os.environ.get("PI_AGENT_PORT", "9100"))
MC_HOST = os.environ.get("MC_HOST", "127.0.0.1")
MC_PORT = int(os.environ.get("MC_PORT", "0") or 0)  # 0 = no Minecraft server on this Pi
PUSH_URL = os.environ.get("BACKUP_PUSH_URL", "").rstrip("/")
PUSH_TOKEN = os.environ.get("BACKUP_PUSH_TOKEN", "")
PUSH_EVERY = 30

_last_cpu = None


def _cpu_times():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return idle, sum(parts)


def cpu_percent():
    """Percent since the previous call (first call samples over 0.25 s)."""
    global _last_cpu
    if _last_cpu is None:
        _last_cpu = _cpu_times()
        time.sleep(0.25)
    idle, total = _cpu_times()
    d_idle, d_total = idle - _last_cpu[0], total - _last_cpu[1]
    _last_cpu = (idle, total)
    return round(100 * (1 - d_idle / d_total), 1) if d_total else 0.0


def host_stats():
    out = {"hostname": socket.gethostname(), "cores": os.cpu_count()}
    try:
        out["cpu_percent"] = cpu_percent()
    except OSError:
        pass
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            out["temp_c"] = round(int(f.read().strip()) / 1000, 1)
    except (OSError, ValueError):
        pass
    try:
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                mem[k] = int(v.split()[0]) * 1024
        out["mem_total"] = mem["MemTotal"]
        out["mem_used"] = mem["MemTotal"] - mem.get("MemAvailable", mem.get("MemFree", 0))
    except (OSError, KeyError, ValueError):
        pass
    try:
        du = shutil.disk_usage("/")
        out["disk_total"], out["disk_used"] = du.total, du.used
    except OSError:
        pass
    try:
        with open("/proc/uptime") as f:
            out["uptime_seconds"] = int(float(f.read().split()[0]))
        out["load"] = [round(x, 2) for x in os.getloadavg()]
    except OSError:
        pass
    return out


# ---- Hardware (read once at startup) ---------------------------------------

CPU_PARTS = {"0xd0b": "Arm Cortex-A76", "0xd08": "Arm Cortex-A72", "0xd03": "Arm Cortex-A53", "0xd07": "Arm Cortex-A57"}


def _read(path):
    try:
        with open(path) as f:
            return f.read().replace("\0", "").strip()
    except OSError:
        return ""


def _root_disk():
    """Size and kind of the drive that holds /, e.g. (32 GB, "microSD")."""
    try:
        st = os.stat("/")
        dev = os.path.realpath(f"/sys/dev/block/{os.major(st.st_dev)}:{os.minor(st.st_dev)}")
        if os.path.exists(os.path.join(dev, "partition")):
            dev = os.path.dirname(dev)
        name = os.path.basename(dev)
        size = int(_read(os.path.join(dev, "size")) or 0) * 512
        kind = "microSD" if name.startswith("mmcblk") else "NVMe SSD" if name.startswith("nvme") else "USB drive"
        return (size, kind) if size else (None, None)
    except (OSError, ValueError):
        return None, None


def hardware():
    cpuinfo = _read("/proc/cpuinfo")
    part = re.search(r"^CPU part\s*:\s*(\S+)", cpuinfo, re.M)
    name = re.search(r"^model name\s*:\s*(.+)$", cpuinfo, re.M)
    os_release = dict(
        line.split("=", 1) for line in _read("/etc/os-release").splitlines() if "=" in line
    )
    out = {
        "model": _read("/proc/device-tree/model") or None,
        "cpu": CPU_PARTS.get(part.group(1)) if part and part.group(1) in CPU_PARTS else (name.group(1) if name else None),
        "cores": os.cpu_count(),
        "os": os_release.get("PRETTY_NAME", "").strip('"') or None,
        "kernel": os.uname().release,
    }
    try:
        out["cpu_max_mhz"] = int(_read("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq")) // 1000
    except ValueError:
        pass
    m = re.search(r"^MemTotal:\s*(\d+)", _read("/proc/meminfo"), re.M)
    if m:
        out["mem_total"] = int(m.group(1)) * 1024
    out["disk_size"], out["disk_type"] = _root_disk()
    return {k: v for k, v in out.items() if v is not None}


HARDWARE = hardware()


# ---- Minecraft Server List Ping -------------------------------------------

def _varint(n):
    out = b""
    n &= 0xFFFFFFFF
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def _read_varint(sock):
    num = 0
    for i in range(5):
        byte = sock.recv(1)
        if not byte:
            raise ConnectionError("connection closed")
        num |= (byte[0] & 0x7F) << (7 * i)
        if not byte[0] & 0x80:
            return num
    raise ValueError("bad varint")


def _recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("connection closed")
        buf += chunk
    return buf


def _plain(desc):
    if isinstance(desc, str):
        text = desc
    elif isinstance(desc, dict):
        text = desc.get("text", "") + "".join(_plain(e) for e in desc.get("extra", []))
    elif isinstance(desc, list):
        text = "".join(_plain(e) for e in desc)
    else:
        text = ""
    out, skip = [], False
    for ch in text:  # strip legacy § colour codes
        if skip:
            skip = False
        elif ch == "§":
            skip = True
        else:
            out.append(ch)
    return "".join(out)


def minecraft_status(host, port, timeout=4):
    start = time.time()
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.settimeout(timeout)
            h = host.encode()
            hs = b"\x00" + _varint(767) + _varint(len(h)) + h + struct.pack(">H", port) + _varint(1)
            s.sendall(_varint(len(hs)) + hs + b"\x01\x00")
            _read_varint(s)
            _read_varint(s)
            data = _recv_exact(s, _read_varint(s))
        info = json.loads(data.decode("utf-8"))
        players = info.get("players", {}) or {}
        return {
            "online": True,
            "players_online": players.get("online", 0),
            "players_max": players.get("max", 0),
            "players": [p.get("name") for p in players.get("sample") or []],
            "version": (info.get("version") or {}).get("name", ""),
            "motd": _plain(info.get("description", "")).strip(),
            "ping_ms": round((time.time() - start) * 1000),
            "favicon": info.get("favicon") if str(info.get("favicon", "")).startswith("data:image/") else None,
        }
    except Exception as e:
        return {"online": False, "error": str(e) or e.__class__.__name__}


def report():
    body = host_stats()
    body["hardware"] = HARDWARE
    if MC_PORT:
        body["minecraft"] = minecraft_status(MC_HOST, MC_PORT)
    return body


def push_loop():
    """Send the report to the backup site; log only when pushing starts or stops working."""
    failing = None
    while True:
        try:
            body = report()
            if "minecraft" in body:
                body["minecraft"].pop("favicon", None)  # the backup gets icons from NAS
            data = json.dumps({"source": "pi", "pi": dict(reachable=True, **body)}).encode()
            req = urllib.request.Request(
                PUSH_URL + "/api/push",
                data=data,
                method="POST",
                headers={"Authorization": f"Bearer {PUSH_TOKEN}", "Content-Type": "application/json", "User-Agent": "homebase-pi-agent"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                r.read()
            if failing is not False:
                print("backup push working", flush=True)
            failing = False
        except Exception as e:
            if failing is not True:
                print(f"backup push failed: {e}", flush=True)
            failing = True
        time.sleep(PUSH_EVERY)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] != "/stats":
            return self._send(404, {"error": "not found"})
        if not TOKEN or self.headers.get("X-Token") != TOKEN:
            return self._send(401, {"error": "bad token"})
        self._send(200, report())

    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Set PI_AGENT_TOKEN first.")
    cpu_percent()  # prime the counter so the first reading isn't a startup spike
    if PUSH_URL and PUSH_TOKEN:
        threading.Thread(target=push_loop, daemon=True).start()
    print(f"pi-agent listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
