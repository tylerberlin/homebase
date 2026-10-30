#!/usr/bin/env python3
"""
Homebase stats agent: run it on any machine you want a card for.

It does NOT host the dashboard; it only answers GET /stats with a small JSON report (CPU,
temperature, memory, disk, uptime, hardware, Docker containers, and a Minecraft server's status
if MC_PORT is set). Homebase fetches it every few seconds, so keep the port private (a home
network or Tailscale), and every request must carry the token.

  Linux, including a Raspberry Pi and Unraid: standard library only.
  macOS and Windows: also needs psutil (pip install psutil).

Settings come from environment variables:
  AGENT_TOKEN   required; the same token goes in Homebase's AGENTS setting
  AGENT_PORT    default 9100
  AGENT_BIND    the address to listen on (default all); e.g. this machine's Tailscale address
  DISK_PATH     which disk to report (default: the system disk)
  MC_PORT       a local Minecraft server's port, to report its players (MC_HOST defaults to 127.0.0.1)
  DOCKER_SOCKET default /var/run/docker.sock; containers are listed when it's readable
  NOW_PLAYING   1 to share what's playing for the Now Playing card, with play/pause and skip:
                the Music app or Spotify on macOS (macOS asks once to let it control them), or any
                player that works with playerctl on Linux

If BACKUP_PUSH_URL and BACKUP_PUSH_TOKEN are set, it also sends the report to a Homebase backup
site every 30 s (see the README).
"""
import json
import os
import platform
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SYSTEM = {"Linux": "linux", "Darwin": "darwin", "Windows": "windows"}.get(platform.system(), "linux")
TOKEN = os.environ.get("AGENT_TOKEN") or os.environ.get("PI_AGENT_TOKEN", "")
PORT = int(os.environ.get("AGENT_PORT") or os.environ.get("PI_AGENT_PORT") or 9100)
BIND = os.environ.get("AGENT_BIND", "0.0.0.0")
MC_HOST = os.environ.get("MC_HOST", "127.0.0.1")
MC_PORT = int(os.environ.get("MC_PORT", "0") or 0)  # 0 = no Minecraft server here
DOCKER_SOCKET = os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock")
PUSH_URL = os.environ.get("BACKUP_PUSH_URL", "").rstrip("/")
PUSH_TOKEN = os.environ.get("BACKUP_PUSH_TOKEN", "")
PUSH_EVERY = 30
NOW_PLAYING = os.environ.get("NOW_PLAYING", "").lower() in ("1", "true", "yes", "on")

try:
    import psutil  # optional on Linux, needed on macOS and Windows
except ImportError:
    psutil = None


def _read(path):
    try:
        with open(path) as f:
            return f.read().replace("\0", "").strip()
    except OSError:
        return ""


def _run(cmd, timeout=10):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _disk_path():
    if os.environ.get("DISK_PATH"):
        return os.environ["DISK_PATH"]
    if SYSTEM == "windows":
        return os.environ.get("SystemDrive", "C:") + "\\"
    if SYSTEM == "darwin" and os.path.isdir("/System/Volumes/Data"):
        return "/System/Volumes/Data"  # macOS keeps your files here; / is the read-only system volume
    return "/"


# ---- CPU, memory, temperature, uptime ---------------------------------------

_last_cpu = None


def _cpu_times():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
    return idle, sum(parts)


def cpu_percent():
    """Percent since the previous call (first call samples over 0.25 s)."""
    global _last_cpu
    if SYSTEM != "linux":
        return round(psutil.cpu_percent(interval=None), 1)
    if _last_cpu is None:
        _last_cpu = _cpu_times()
        time.sleep(0.25)
    idle, total = _cpu_times()
    d_idle, d_total = idle - _last_cpu[0], total - _last_cpu[1]
    _last_cpu = (idle, total)
    return round(100 * (1 - d_idle / d_total), 1) if d_total else 0.0


# hwmon drivers that measure the CPU itself, best first, with the reading to prefer
CPU_SENSORS = {"k10temp": ("Tctl", "Tdie"), "zenpower": ("Tdie", "Tctl"), "coretemp": ("Package id 0",), "cpu_thermal": (), "soc_thermal": ()}


def cpu_temp():
    """The CPU's temperature on Linux: AMD (k10temp), Intel (coretemp) or a Pi (cpu_thermal)."""
    base = "/sys/class/hwmon"
    found = {}
    try:
        for d in sorted(os.listdir(base)):
            name = _read(f"{base}/{d}/name")
            if name in CPU_SENSORS and name not in found:
                temps = {}
                for fn in os.listdir(f"{base}/{d}"):
                    m = re.fullmatch(r"temp(\d+)_input", fn)
                    if m:
                        try:
                            temps[_read(f"{base}/{d}/temp{m.group(1)}_label") or fn] = int(_read(f"{base}/{d}/{fn}")) / 1000
                        except ValueError:
                            pass
                if temps:
                    found[name] = temps
    except OSError:
        pass
    for name, prefer in CPU_SENSORS.items():
        temps = found.get(name)
        if temps:
            pick = next((temps[p] for p in prefer if p in temps), max(temps.values()))
            return round(pick, 1)
    # A Pi without hwmon: its first thermal zone is the CPU. On PCs that zone is often the
    # motherboard, so it's only used when it says it's the CPU.
    if "cpu" in _read("/sys/class/thermal/thermal_zone0/type").lower() or "x86_pkg" in _read("/sys/class/thermal/thermal_zone0/type"):
        try:
            return round(int(_read("/sys/class/thermal/thermal_zone0/temp")) / 1000, 1)
        except ValueError:
            pass
    return None


def host_stats():
    out = {"hostname": socket.gethostname(), "cores": os.cpu_count()}
    try:
        out["cpu_percent"] = cpu_percent()
    except OSError:
        pass
    if SYSTEM == "linux":
        t = cpu_temp()
        if t is not None:
            out["temp_c"] = t
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
            out["uptime_seconds"] = int(float(_read("/proc/uptime").split()[0]))
        except (IndexError, ValueError):
            pass
    else:
        vm = psutil.virtual_memory()
        out["mem_total"], out["mem_used"] = vm.total, vm.total - vm.available
        out["uptime_seconds"] = int(time.time() - psutil.boot_time())
    try:
        du = shutil.disk_usage(_disk_path())
        out["disk_total"], out["disk_used"] = du.total, du.used
    except OSError:
        pass
    try:
        load = os.getloadavg() if hasattr(os, "getloadavg") else psutil.getloadavg()
        out["load"] = [round(x, 2) for x in load]
    except (OSError, AttributeError):
        pass
    return out


# ---- Hardware and platform (read once at startup) -----------------------------

CPU_PARTS = {"0xd0b": "Arm Cortex-A76", "0xd08": "Arm Cortex-A72", "0xd03": "Arm Cortex-A53", "0xd07": "Arm Cortex-A57"}


def _linux_disk():
    """Size and kind of the drive that holds the reported disk, e.g. (32 GB, "microSD")."""
    try:
        st = os.stat(_disk_path())
        dev = os.path.realpath(f"/sys/dev/block/{os.major(st.st_dev)}:{os.minor(st.st_dev)}")
        if os.path.exists(os.path.join(dev, "partition")):
            dev = os.path.dirname(dev)
        name = os.path.basename(dev)
        size = int(_read(os.path.join(dev, "size")) or 0) * 512
        rotational = _read(os.path.join(dev, "queue/rotational")) == "1"
        kind = "microSD" if name.startswith("mmcblk") else "NVMe SSD" if name.startswith("nvme") else "hard drive" if rotational else "SSD"
        return (size, kind) if size else (None, None)
    except (OSError, ValueError):
        return None, None


def _linux_os():
    for p in ("/host/etc/os-release", "/etc/os-release"):  # in a container, mount the host's at /host/etc/os-release
        m = re.search(r'^PRETTY_NAME="?([^"\n]+)"?', _read(p), re.M)
        if m and not (p == "/etc/os-release" and os.path.exists("/.dockerenv")):
            return m.group(1)
    if os.path.exists("/etc/unraid-version"):
        m = re.search(r'version="?([^"\n]+)', _read("/etc/unraid-version"))
        return f"Unraid {m.group(1)}" if m else "Unraid"
    return "Linux"


def _linux_hardware():
    cpuinfo = _read("/proc/cpuinfo")
    part = re.search(r"^CPU part\s*:\s*(\S+)", cpuinfo, re.M)
    name = re.search(r"^model name\s*:\s*(.+)$", cpuinfo, re.M)
    model = _read("/proc/device-tree/model")  # a Pi or another board with a device tree
    if not model:  # a PC: its maker and model from DMI, skipping placeholders
        junk = re.compile(r"to be filled|default string|system product|^o\.?e\.?m|^$", re.I)
        vendor, product = _read("/sys/class/dmi/id/sys_vendor"), _read("/sys/class/dmi/id/product_name")
        board = " ".join(x for x in (_read("/sys/class/dmi/id/board_vendor"), _read("/sys/class/dmi/id/board_name")) if not junk.search(x))
        model = f"{vendor} {product}" if vendor and not junk.search(product) else board or vendor
    out = {
        "model": model or None,
        "cpu": CPU_PARTS.get(part.group(1)) if part and part.group(1) in CPU_PARTS else (re.sub(r"\s+", " ", name.group(1)) if name else None),
        "cores": os.cpu_count(),
        "os": _linux_os(),
        "kernel": os.uname().release,
    }
    try:
        out["cpu_max_mhz"] = int(_read("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq")) // 1000
    except ValueError:
        pass
    m = re.search(r"^MemTotal:\s*(\d+)", _read("/proc/meminfo"), re.M)
    if m:
        out["mem_total"] = int(m.group(1)) * 1024
    out["disk_size"], out["disk_type"] = _linux_disk()
    return out


def _mac_hardware():
    info = dict(
        (k.strip(), v.strip()) for k, v in (line.split(":", 1) for line in _run(["system_profiler", "SPHardwareDataType"]).splitlines() if ":" in line)
    )
    out = {
        "model": info.get("Model Name"),
        "cpu": info.get("Chip") or _run(["sysctl", "-n", "machdep.cpu.brand_string"]) or None,
        "cores": os.cpu_count(),
        "os": f"macOS {platform.mac_ver()[0]}",
        "mem_total": psutil.virtual_memory().total,
        "disk_type": "SSD",
    }
    try:
        out["disk_size"] = shutil.disk_usage(_disk_path()).total
    except OSError:
        pass
    return out


def _windows_hardware():
    cpu = None
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as k:
            cpu = winreg.QueryValueEx(k, "ProcessorNameString")[0].strip()
    except OSError:
        pass
    build = int((platform.version().split(".") + ["0", "0", "0"])[2] or 0)
    model = _run(["powershell", "-NoProfile", "-Command", "$c = Get-CimInstance Win32_ComputerSystem; \"$($c.Manufacturer) $($c.Model)\""])
    out = {
        "model": model or None,
        "cpu": cpu or platform.processor() or None,
        "cores": os.cpu_count(),
        "os": f"Windows {'11' if build >= 22000 else platform.release()}",
        "kernel": platform.version(),
        "mem_total": psutil.virtual_memory().total,
    }
    try:
        out["disk_size"] = shutil.disk_usage(_disk_path()).total
    except OSError:
        pass
    return out


def hardware():
    if SYSTEM != "linux" and psutil is None:
        return {}  # sharing only what's playing (see __main__)
    hw = {"linux": _linux_hardware, "darwin": _mac_hardware, "windows": _windows_hardware}[SYSTEM]()
    return {k: v for k, v in hw.items() if v is not None}


def time_zone():
    """The IANA time zone (America/New_York), for the card's local clock."""
    tz = os.environ.get("TZ") or _read("/etc/timezone")
    if not tz:
        try:
            tz = os.path.realpath("/etc/localtime").split("zoneinfo/", 1)[1]
        except (IndexError, OSError):
            tz = ""
    return tz if re.fullmatch(r"[A-Za-z_]+(/[A-Za-z0-9_+-]+)*", tz or "") else None


HARDWARE = hardware()
PLATFORM = {"system": SYSTEM, "os": HARDWARE.get("os"), "is_pi": "Raspberry Pi" in (HARDWARE.get("model") or "")}
TZ = time_zone()


# ---- Docker containers -----------------------------------------------------------

DOCKER_STATE = {"running": "RUNNING", "restarting": "DEPLOYING", "dead": "CRASHED"}


_UNIT = {"second": 1, "minute": 60, "hour": 3600, "day": 86400, "week": 604800, "month": 2592000, "year": 31536000}


def _docker_uptime(status):
    """Seconds from Docker's status text, e.g. "Up 3 days (healthy)"."""
    m = re.match(r"^Up (?:About an? |Less than an? )?(\d+)?\s*(second|minute|hour|day|week|month|year)", status)
    return (int(m.group(1)) if m.group(1) else 1) * _UNIT[m.group(2)] if m else None


def _docker_note(status):
    if "(unhealthy)" in status:
        return "unhealthy"
    if "(health: starting)" in status:
        return "starting"
    m = re.match(r"^Exited \((\d+)\)", status)
    if m and m.group(1) != "0":
        return f"exited with code {m.group(1)}"
    if status.startswith("Restarting"):
        return "restarting"
    return None


def containers():
    """Containers from the Docker socket, when there is one and we're allowed to read it."""
    if SYSTEM == "windows" or not os.path.exists(DOCKER_SOCKET):
        return None
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(4)
            s.connect(DOCKER_SOCKET)
            s.sendall(b"GET /containers/json?all=1 HTTP/1.0\r\nHost: docker\r\n\r\n")
            raw = b""
            while True:
                chunk = s.recv(65536)
                if not chunk:
                    break
                raw += chunk
        head, _, body = raw.partition(b"\r\n\r\n")
        if b" 200 " not in head.split(b"\r\n", 1)[0]:
            return None
        out = []
        for c in json.loads(body):
            status = c.get("Status") or ""
            item = {
                "name": (c.get("Names") or ["?"])[0].lstrip("/"),
                "state": DOCKER_STATE.get(c.get("State"), "STOPPED"),
                "kind": "Docker",
                "id": (c.get("Id") or "")[:12],
                "image": c.get("Image"),
            }
            up = _docker_uptime(status)
            if up is not None:
                item["uptime_seconds"] = up
            note = _docker_note(status)
            if note:
                item["note"] = note
            out.append(item)
        return sorted(out, key=lambda c: c["name"])
    except (OSError, ValueError):
        return None


# ---- Minecraft Server List Ping ------------------------------------------------

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


# ---- Now playing -------------------------------------------------------------------
# What's playing, its cover, and play/pause/skip/volume. macOS: the Music app and Spotify, through
# AppleScript (only when the app is already open; it never launches one). Linux: playerctl (MPRIS).

SEP = "\x1f"
MAC_APPS = ("Music", "Spotify")
# Per app: the player state, track fields and volume, separated by SEP. Spotify reports ms.
_MAC_NOW = """
if application "{app}" is running then
  tell application "{app}"
    try
      set ps to player state as string
      if ps is "stopped" then return "stopped"
      set tr to current track
      return ps & (character id 31) & (name of tr) & (character id 31) & (artist of tr) & (character id 31) & (album of tr) & (character id 31) & ((duration of tr) as string) & (character id 31) & ((player position) as string) & (character id 31) & ((sound volume) as string)
    on error
      return "stopped"
    end try
  end tell
end if
return "off"
"""
_MAC_ART = {
    "Music": """
tell application "Music"
  set d to raw data of artwork 1 of current track
end tell
set f to open for access (POSIX file "{path}") with write permission
set eof f to 0
write d to f
close access f
""",
    "Spotify": 'tell application "Spotify" to return artwork url of current track',
}
_MAC_DO = {"playpause": "playpause", "next": "next track", "previous": "previous track"}
_art = {"key": None, "data": None}
_art_lock = threading.Lock()


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def _osascript(script, timeout=4):
    return _run(["osascript", "-e", script], timeout)


def _mac_players():
    out = []
    for app in MAC_APPS:
        # Only ask apps that are open: naming one that isn't installed makes macOS ask where it is.
        if not _run(["pgrep", "-x", app]):
            continue
        raw = _osascript(_MAC_NOW.replace("{app}", app))
        parts = raw.split(SEP)
        if len(parts) < 7 or parts[0] not in ("playing", "paused"):
            continue
        duration = _num(parts[4])
        if app == "Spotify" and duration:
            duration /= 1000
        out.append({
            "app": app, "state": parts[0], "title": parts[1], "artist": parts[2], "album": parts[3],
            "duration": duration, "position": _num(parts[5]), "volume": _num(parts[6]),
        })
    return out


_PLAYERCTL_FMT = SEP.join(["{{playerName}}", "{{lc(status)}}", "{{title}}", "{{artist}}", "{{album}}", "{{mpris:length}}", "{{position}}", "{{volume}}", "{{mpris:artUrl}}"])


def _linux_players():
    if not shutil.which("playerctl"):
        return []
    out = []
    for line in _run(["playerctl", "-a", "metadata", "--format", _PLAYERCTL_FMT]).splitlines():
        p = line.split(SEP)
        if len(p) < 9 or p[1] not in ("playing", "paused") or not p[2]:
            continue
        length, pos, vol = _num(p[5]), _num(p[6]), _num(p[7])
        out.append({
            "app": p[0], "state": p[1], "title": p[2], "artist": p[3], "album": p[4],
            "duration": length / 1e6 if length else None, "position": pos / 1e6 if pos is not None else None,
            "volume": round(vol * 100) if vol is not None else None, "art_url": p[8] or None,
        })
    return out


def now_playing():
    """The player that's playing (or else paused), or {"state": "off"}."""
    if not NOW_PLAYING:
        return {"state": "off", "enabled": False}
    players = {"darwin": _mac_players, "linux": _linux_players}.get(SYSTEM, lambda: [])()
    if not players:
        return {"state": "off"}
    p = next((x for x in players if x["state"] == "playing"), players[0])
    p = dict(p)
    p["key"] = f'{p["app"]}|{p["artist"]}|{p["album"]}'
    p.pop("art_url", None)
    p["controls"] = True
    return p


def _fetch(url, limit=5_000_000):
    if url.startswith("file://"):
        with open(urllib.request.url2pathname(url[7:]), "rb") as f:
            return f.read(limit)
    if not url.startswith("https://"):
        return None
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "homebase-agent"}), timeout=6) as r:
        return r.read(limit)


def now_playing_art():
    """The current track's cover image (bytes), cached per album."""
    if not NOW_PLAYING:
        return None
    players = {"darwin": _mac_players, "linux": _linux_players}.get(SYSTEM, lambda: [])()
    if not players:
        return None
    p = next((x for x in players if x["state"] == "playing"), players[0])
    key = f'{p["app"]}|{p["artist"]}|{p["album"]}'
    with _art_lock:
        if _art["key"] == key:
            return _art["data"]
        data = None
        try:
            if SYSTEM == "darwin" and p["app"] == "Music":
                fd, path = tempfile.mkstemp(prefix="homebase-art-")
                os.close(fd)
                try:
                    _osascript(_MAC_ART["Music"].replace("{path}", path), 8)
                    with open(path, "rb") as f:
                        data = f.read() or None
                finally:
                    os.unlink(path)
            elif SYSTEM == "darwin" and p["app"] == "Spotify":
                url = _osascript(_MAC_ART["Spotify"])
                data = _fetch(url) if url else None
            elif p.get("art_url"):
                data = _fetch(p["art_url"])
        except (OSError, ValueError):
            data = None
        _art.update(key=key, data=data)
        return data


def control(action, value=None, app=None):
    """play/pause, next, previous, or volume (0-100) on the player that's showing."""
    if not NOW_PLAYING:
        return False
    players = {"darwin": _mac_players, "linux": _linux_players}.get(SYSTEM, lambda: [])()
    target = next((x for x in players if x["app"] == app), None) or next((x for x in players if x["state"] == "playing"), None) or (players[0] if players else None)
    if not target:
        return False
    name = target["app"]
    if SYSTEM == "darwin":
        if action == "volume":
            cmd = f"set sound volume to {max(0, min(100, int(value or 0)))}"
        elif action in _MAC_DO:
            cmd = _MAC_DO[action]
        else:
            return False
        _osascript(f'tell application "{name}" to {cmd}')
        return True
    if action == "volume":
        args = ["volume", str(max(0, min(100, int(value or 0))) / 100)]
    elif action in ("playpause", "next", "previous"):
        args = ["play-pause" if action == "playpause" else action]
    else:
        return False
    _run(["playerctl", "-p", name, *args])
    return True


# ---- The report, and serving it ----------------------------------------------------

def report():
    body = host_stats()
    body["hardware"] = HARDWARE
    body["platform"] = PLATFORM
    if TZ:
        body["tz"] = TZ
    found = containers()
    if found is not None:
        body["containers"] = found
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
                body["minecraft"].pop("favicon", None)  # the backup gets icons from the main site
            data = json.dumps({"source": "pi", "pi": dict(reachable=True, **body)}).encode()
            req = urllib.request.Request(
                PUSH_URL + "/api/push",
                data=data,
                method="POST",
                headers={"Authorization": f"Bearer {PUSH_TOKEN}", "Content-Type": "application/json", "User-Agent": "homebase-agent"},
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
        path = self.path.split("?")[0]
        if path not in ("/stats", "/nowplaying", "/nowplaying/art"):
            return self._send(404, {"error": "not found"})
        if not TOKEN or self.headers.get("X-Token") != TOKEN:
            return self._send(401, {"error": "bad token"})
        if path == "/stats":
            if SYSTEM != "linux" and psutil is None:
                return self._send(503, {"error": "install psutil for stats (pip install psutil)"})
            return self._send(200, report())
        if path == "/nowplaying":
            return self._send(200, now_playing())
        data = now_playing_art()
        if not data:
            return self._send(404, {"error": "no cover"})
        kind = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.split("?")[0] != "/control":
            return self._send(404, {"error": "not found"})
        if not TOKEN or self.headers.get("X-Token") != TOKEN:
            return self._send(401, {"error": "bad token"})
        try:
            size = min(int(self.headers.get("Content-Length") or 0), 4096)
            body = json.loads(self.rfile.read(size) or b"{}")
        except ValueError:
            return self._send(400, {"error": "bad request"})
        ok = control(str(body.get("action", "")), body.get("value"), body.get("app"))
        self._send(200 if ok else 409, {"ok": ok})

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
        raise SystemExit("Set AGENT_TOKEN first (any long random string; the same one goes in Homebase).")
    if SYSTEM != "linux" and psutil is None and not NOW_PLAYING:
        raise SystemExit("On macOS and Windows the agent needs psutil: pip install psutil")
    if psutil is not None:
        psutil.cpu_percent(interval=None)
    if SYSTEM == "linux" or psutil is not None:
        cpu_percent()  # prime the counter so the first reading isn't a startup spike
    if PUSH_URL and PUSH_TOKEN:
        threading.Thread(target=push_loop, daemon=True).start()
    print(f"homebase agent ({PLATFORM['os']}) listening on :{PORT}" + (", sharing now playing" if NOW_PLAYING else ""), flush=True)
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
