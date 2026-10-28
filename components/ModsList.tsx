"use client";

import { useState } from "react";
import type { Mod, ModList } from "@/lib/types";

// A server's installed mods: icon, name and version, whether players need it to join, and a
// heads-up when Modrinth has a newer version.

const CLIENT: Record<NonNullable<Mod["client"]>, { text: string; cls: string }> = {
  required: { text: "Players need it", cls: "need" },
  optional: { text: "Optional for players", cls: "" },
  unsupported: { text: "Server only", cls: "" },
};

function ModIcon({ mod }: { mod: Mod }) {
  const [ok, setOk] = useState(!!mod.icon);
  return (
    <span className="mod-icon" aria-hidden="true">
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mod.icon} alt="" width={36} height={36} loading="lazy" onError={() => setOk(false)} />
      ) : (
        mod.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function ModRow({ mod }: { mod: Mod }) {
  const client = mod.client && CLIENT[mod.client];
  const body = (
    <>
      <ModIcon mod={mod} />
      <span className="mod-main">
        <span className="mod-name">{mod.name}</span>
        <span className="mod-desc">
          {mod.version && <span className="mod-ver mono">{mod.version}</span>}
          {mod.version && mod.description && " · "}
          {mod.description}
        </span>
      </span>
    </>
  );
  return (
    <li className={`mod ${mod.disabled ? "off" : ""}`}>
      {mod.url ? (
        <a className="mod-link" href={mod.url} target="_blank" rel="noopener">
          {body}
          <span className="sr-only"> (opens Modrinth in a new tab)</span>
        </a>
      ) : (
        <div className="mod-link">{body}</div>
      )}
      <span className="mod-tags">
        {mod.disabled ? (
          <span className="mod-tag">Turned off</span>
        ) : (
          client && <span className={`mod-tag ${client.cls}`}>{client.text}</span>
        )}
        {mod.update && (
          <a className="mod-tag update" href={mod.update.url} target="_blank" rel="noopener" title={`Update available: ${mod.update.version}`}>
            Update · <span className="mono">{mod.update.version}</span>
          </a>
        )}
      </span>
    </li>
  );
}

export default function ModsList({ list }: { list: ModList }) {
  const active = list.mods.filter((m) => !m.disabled);
  const needed = active.filter((m) => m.client === "required").length;
  const updates = active.filter((m) => m.update).length;
  return (
    <div className="section mods">
      <h3 className="mods-head">
        <span>Mods · {active.length}</span>
        {list.loader && <span className="mods-loader">{list.loader}</span>}
      </h3>
      {list.error ? (
        <div className="err">{list.error}</div>
      ) : !list.mods.length ? (
        <div className="mods-empty">No mods installed.</div>
      ) : (
        <>
          <ul className="mod-list">
            {list.mods.map((m) => (
              <ModRow key={m.file} mod={m} />
            ))}
          </ul>
          <div className="mods-note">
            {needed > 0 && `To join, players need ${list.loader ?? "the same loader"} and the ${needed === 1 ? "mod" : `${needed} mods`} marked “Players need it”. `}
            {updates > 0 ? `${updates} ${updates === 1 ? "update" : "updates"} available.` : "All up to date."}
          </div>
        </>
      )}
    </div>
  );
}
