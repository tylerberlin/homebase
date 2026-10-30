"use client";

import AppControls from "./AppControls";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";
import { AnimatedNumber } from "@/lib/useAnimatedNumber";
import type { Minecraft } from "@/lib/types";

function Player({ name }: { name: string }) {
  const [img, setImg] = useState(true);
  return (
    <span className="player">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" width={18} height={18} loading="lazy" onError={() => setImg(false)} src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/18`} />
      )}
      {name}
    </span>
  );
}

/** Copies text even on plain-http Tailscale addresses, where navigator.clipboard is unavailable. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    if (await copyText(address)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <button type="button" className="mc-addr mono copy" onClick={onClick} aria-label={`Copy server address ${address}`}>
      {address}
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/** Pixel grass block, used when a server has no icon set. */
export function GrassBlock() {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="8" height="8" fill="#8b5a2b" />
      <rect width="8" height="3" fill="#5dbb3f" />
      <rect y="3" width="1" height="1" fill="#5dbb3f" /><rect x="3" y="3" width="2" height="1" fill="#5dbb3f" />
      <rect x="7" y="3" width="1" height="2" fill="#5dbb3f" /><rect x="1" y="1" width="1" height="1" fill="#79d152" />
      <rect x="5" y="0" width="1" height="1" fill="#79d152" /><rect x="2" y="5" width="1" height="1" fill="#6e4520" />
      <rect x="5" y="6" width="1" height="1" fill="#6e4520" /><rect x="6" y="4" width="1" height="1" fill="#a8743f" />
    </svg>
  );
}

export default function MinecraftBlock({ mc, server }: { mc: Minecraft | null; server?: string }) {
  if (!mc) return null;
  const on = mc.online;
  return (
    <div className="section">
      <h3>Minecraft</h3>
      <div className="mc">
        <div className={`mc-icon ${on ? "" : "off"}`}>
          {mc.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mc.favicon} alt="" width={64} height={64} />
          ) : (
            <GrassBlock />
          )}
        </div>
        <div className="mc-info">
          <div className="mc-name">
            <span className={`dot live ${on ? "ok" : "bad"}`} />
            {mc.label}
            <span className="sr-only">{on ? " (online)" : " (offline)"}</span>
          </div>
          {mc.address && <CopyAddress address={mc.address} />}
          <div className="mc-addr">
            {on ? (
              `${mc.version} · ${mc.ping_ms} ms`
            ) : (
              <span className="err">Offline{mc.error ? ` · ${mc.error}` : ""}</span>
            )}
          </div>
        </div>
        {on && (
          <div className="mc-count">
            <div className="n mono">
              <AnimatedNumber value={mc.players_online} />
            </div>
            <div className="of">of {mc.players_max} online</div>
          </div>
        )}
      </div>
      {!!mc.players?.length && (
        <div className="players">
          {mc.players.map((p) => (
            <Player key={p} name={p} />
          ))}
        </div>
      )}
      {on && mc.motd && mc.motd.trim().toLowerCase() !== mc.label.trim().toLowerCase() && <div className="motd">{mc.motd}</div>}
      {server && mc.control && <AppControls server={server} app={mc.control} running={on} name={mc.label} />}
    </div>
  );
}
