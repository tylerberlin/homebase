# Homebase

A glassy, self-hosted home dashboard for a home server and a Raspberry Pi, plus everything
else you check every day: weather, calendar, countdowns, live sports scores, stocks and news.

Built with Next.js 16, React 19 and plain CSS. No database is needed for the main site.

![Homebase home screen](docs/screenshots/home-dark.jpg)

## Features

- **Servers**: CPU, memory, temperature (ring gauges and sparklines), storage pools, apps
  and alerts from TrueNAS, hardware specs, and a Raspberry Pi through a small stats agent.
  Tap any app, VM or container for its details: CPU, memory, uptime, image or version, and
  problems like "unhealthy" or "update available". Start, stop and restart from there too
  (TrueNAS apps, Docker containers, Proxmox VMs and containers; `APP_CONTROLS=off` to hide it).
- **Minecraft (optional)**: players online, version and the installed mods (with update checks),
  and Start / Stop / Restart right in the Minecraft section (`NAS_MC_APP` names the TrueNAS app or
  container that runs it; on a Pi or other machine, set `MC_SERVICE` on the agent).
  No Minecraft server? Leave `NAS_MC_PORT` / `PI_MC_PORT` unset and the Minecraft tab never shows.
- **Home tab**: clock, weather (home or where you are), calendar (.ics links), countdowns,
  sports with live scores (ESPN; tap a team for the box score, what's next and recent results),
  stocks, and news from any RSS feed.
- **Now playing**: the song and its cover, with play/pause and skip, from the Music app or
  Spotify on a Mac, any player on Linux, or anything that scrobbles to Last.fm.
- **Customizable**: drag cards around right on the page, show or hide them, and pick teams,
  stocks and feeds in Settings.
- **Themes**: Glass (with accent colors), Blocks, Inferno, Handheld, Ancient, Drop Zone,
  Arcade, Neon and Space, plus four movie-night themes: Deep Water, Time Circuits,
  Hyperspace and Expedition (each hides a small easter egg), and six holiday themes: Spooky,
  Harvest, Snowfall, New Year, Sweetheart and Stars & Stripes. Ten of them have light and dark
  versions, and weather icons follow the theme (pixel art in the pixel themes). Problems show up in each
  theme's own style, and a few themes hide easter eggs. Optional game-day colors tint the page in your team's color
  while they're playing.
- **Room display**: a full-screen mode with a big clock, a live scoreboard and rotating cards.
- **Own login**: a password plus Face ID / Touch ID passkeys, signed session cookies, and
  sign-out after 15 minutes idle.
- **Alerts on your phone**: a push notification when a server or endpoint goes down (and comes
  back), and when your teams' games start and finish. Turn it on per device in Settings → Alerts;
  nothing else to set up.
- Works on phones and can be added to the home screen.

## Screenshots

| Light mode | Servers |
| --- | --- |
| ![Light mode](docs/screenshots/home-light.jpg) | ![Servers tab](docs/screenshots/servers.jpg) |

**Room display**: a big clock, rotating cards, and a live scoreboard when your team plays.

| Room display | Live scoreboard |
| --- | --- |
| ![Room display](docs/screenshots/room-display.jpg) | ![Live scoreboard](docs/screenshots/scoreboard.jpg) |

**Themes**

![All themes](docs/screenshots/themes.jpg)

**On your phone**

<img src="docs/screenshots/phone.jpg" alt="Homebase on a phone" width="320">

## Try it

```sh
pnpm install
pnpm dev
```

Open <http://localhost:8090/?demo> for sample data. Add `&display` for the room display,
or `&game` for a sample live game. `?demo=nomc` shows it without any Minecraft server, and `?demo=many` with a Proxmox node,
a Linux mini PC and a Mac.

## Run it for real

**Easiest: Docker.** Download `compose.yaml`, fill in the `CHANGE_ME` values, and:

```sh
docker compose up -d
```

It pulls `ghcr.io/tylerberlin/homebase` (built for Intel and Arm, so it runs on a NAS, a mini PC
or a Raspberry Pi) and keeps its settings in `./data`. On TrueNAS: Apps → Discover Apps → ⋮ →
Install via YAML, paste the same file. Update later with `docker compose pull && docker compose up -d`,
or turn on auto-updates in your Docker tool.

**Without Docker:** build a standalone bundle with `pnpm bundle`, then run `node server.js` from it
(it needs Node 22).

**No server? No problem.** Homebase works as an everyday home dashboard on its own: clock, weather,
calendar, countdowns, sports, stocks and news. The server parts (the Servers tab, status pill and
server strip) only appear once you add a server (see below) or endpoints to check (`LINKS`). Preview it with `?demo=noservers`.

Settings, countdowns and logins are saved to Upstash Redis if you connect it (`KV_REST_API_URL`,
`KV_REST_API_TOKEN`), otherwise to a private file on the machine running Homebase (`DATA_DIR`, default `./data`).

Settings come from environment variables; see `lib/config.ts` for the full list and
`compose.yaml` for a TrueNAS / Docker example. The main ones:

| Variable | What it's for |
| --- | --- |
| `SESSION_SECRET` | Signs login cookies. Use a long random string. |
| `TRUENAS_API_KEY` | Read-only stats from TrueNAS. |
| `TEAMS`, `TICKERS`, `NEWS_FEEDS` | Defaults for the Home tab (also editable in Settings). |
| `CALENDARS` | `Name|https://….ics`, comma-separated. Fetched server-side only. |
| `PUBLIC_HOST` | The address you reach it on, for passkeys (e.g. `dash.example.com`). |
| `HOME_LAT`, `HOME_LON`, `HOME_LOCATION` | Where "Home" is for weather (defaults to the NAS location). |

Keep secrets in environment variables, never in the code.

## Servers

Any mix of these, each with its own card (CPU, memory, temperature, disk, uptime, hardware,
and storage and apps where the server has them):

| What | How | Card shows |
| --- | --- | --- |
| **The machine Homebase runs on** | `NAS_ENABLED=1` | Its own stats, plus Docker containers if `/var/run/docker.sock` is mounted |
| **TrueNAS** (Homebase running on it) | `TRUENAS_API_KEY` | Pools, apps and alerts from TrueNAS |
| **Any other computer**: Linux, a Raspberry Pi, macOS, Windows, Unraid | Run the agent, then list it in `AGENTS` | Its stats, real CPU temperature on Intel/AMD/Pi, Docker containers |
| **Proxmox VE** | `PROXMOX_URL`, `PROXMOX_TOKEN` | One card per node: storages, VMs and containers |

**The agent** (`agent/homebase_agent.py`) is one small Python file. On Linux it needs nothing else;
on macOS and Windows install `psutil` first.

```sh
# Linux, macOS or Windows
AGENT_TOKEN=some-long-random-string python3 homebase_agent.py
```

- **Linux service:** `agent/homebase-agent.service` keeps it running (instructions inside).
- **Unraid, Synology or any Docker host:** `agent/docker-compose.yml` runs it in a container.
- **Windows:** `pip install psutil`, then add a Task Scheduler task that runs `python homebase_agent.py`
  at startup with `AGENT_TOKEN` set.

Then tell Homebase about each machine, comma-separated. Location, coordinates (for weather) and
time zone are optional:

```sh
AGENTS="Mini PC|http://192.168.1.30:9100/stats|token,Mac|http://mac.local:9100/stats|token|Office|40.71|-74.01|America/New_York"
```

Keep the agent's port on your home network or Tailscale rather than the open internet. Mount the
Docker socket read-write (the compose file does) if you want to start and stop containers from
the dashboard; read-only still lists them.

**Proxmox:** starting and stopping VMs needs a token with `VM.PowerMgmt` as well as `PVEAuditor`.

**Proxmox:** create an API token (Datacenter → Permissions → API Tokens) with the `PVEAuditor`
role, then set `PROXMOX_URL=https://your-proxmox:8006` and
`PROXMOX_TOKEN=user@pam!tokenid=secret`. Proxmox's built-in certificate is self-signed, so it
isn't checked unless you set `PROXMOX_VERIFY_SSL=true`.

Weather and local time on a card: `NAS_LAT`/`NAS_LON`/`NAS_TZ` for this machine, the extra
`AGENTS` fields for agents, and `PROXMOX_LAT`/`PROXMOX_LON`/`PROXMOX_TZ` for Proxmox.

## Now playing

The card shows up while something is playing, and hides when nothing is.

- **On a Mac or Linux computer (with buttons):** run the agent there with `NOW_PLAYING=1`, then
  add it to `MUSIC`: `MUSIC="Mac|http://mac.local:9100|token"`. On a Mac it works with the Music
  app and Spotify; the first time, macOS asks to let it control them. On Linux it uses `playerctl`.
  A Mac that's only sharing music doesn't need `psutil`.
- **Anywhere else, like a phone (shown only):** set `LASTFM_USER` and `LASTFM_API_KEY`
  ([get a key](https://www.last.fm/api/account/create)). Your player needs to scrobble to Last.fm;
  on an iPhone, Apple Music needs a scrobbling app for that.

Covers come from the player itself, Last.fm, or Apple's public search, always fetched by the server.

## Alerts

Settings → Alerts → **Turn on alerts for this device**. Each device subscribes on its own; on an
iPhone or iPad, add the dashboard to the Home Screen first and turn alerts on from there. The signing
keys are made the first time and kept in the store; set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` to
bring your own, and `VAPID_SUBJECT` (a `mailto:` or https address) if the push services ask for one.

## Updating

When a new version comes out, a dot appears on the Settings button and Settings says what's new.

- **Forked on GitHub:** click **Sync fork** on your fork. If Vercel builds it, it redeploys by itself.
- **Docker:** `docker compose pull && docker compose up -d`.
- **Downloaded it:** `git pull`, `pnpm install`, `pnpm bundle`, then restart.

Your settings, countdowns and login aren't touched. The check only asks GitHub for the latest
release, at most every 6 hours. Set `UPDATE_REPO=you/your-fork` to follow your own fork instead,
or `UPDATE_CHECK=off` to turn it off.

## License

MIT
