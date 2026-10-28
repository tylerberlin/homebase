"use client";

import { useState } from "react";

// Shortcuts to the services behind the servers (TrueNAS, Cloudflare, …). Each shows the site's
// own favicon, falling back to a lettered blue tile when it can't load (e.g. TrueNAS's self-signed cert).

/** Shows the site's initial until (and unless) its favicon actually loads. */
function Favicon({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  let src = "";
  try {
    src = new URL("/favicon.ico", url).href;
  } catch {}
  return (
    <span className={`quick-icon ${state === "ok" ? "has-img" : ""}`}>
      {state !== "ok" && <span className="quick-letter">{name.trim().charAt(0).toUpperCase()}</span>}
      {src && state !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 1 ? "ok" : "failed")}
          onError={() => setState("failed")}
        />
      )}
    </span>
  );
}

export default function QuickLinks({ links }: { links: { name: string; url: string }[] }) {
  if (!links.length) return null;
  return (
    <nav className="quick" aria-label="Quick links">
      {links.map((l) => (
        <a key={l.url} className="quick-link" href={l.url} target="_blank" rel="noopener noreferrer">
          <Favicon url={l.url} name={l.name} />
          {l.name}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </nav>
  );
}
