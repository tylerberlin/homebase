"use client";

import { useEffect, useState } from "react";
import type { UpdateInfo } from "@/lib/updates";

/** Asks this copy's server once per page load whether a newer Homebase release is out. */
export function useUpdate(enabled: boolean) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/version", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<UpdateInfo>) : null))
      .then((d) => !cancelled && setInfo(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return info;
}

/** The bar at the top of Settings when there's a newer version. */
export default function UpdateNotice({ info }: { info: UpdateInfo }) {
  if (!info.latest) return null;
  return (
    <div className="update-bar" role="status">
      <p className="update-line">
        <strong>Homebase {info.latest} is out.</strong> You have {info.current}.
        {info.url && (
          <>
            {" "}
            <a href={info.url} target="_blank" rel="noreferrer">
              Release notes
            </a>
          </>
        )}
      </p>
      {info.notes && (
        <details className="update-more">
          <summary>What&apos;s new</summary>
          <p className="update-notes">{info.notes}</p>
        </details>
      )}
      <details className="update-more">
        <summary>How to update</summary>
        <ul className="update-how">
          <li>
            <b>Forked on GitHub:</b> open your fork and click <b>Sync fork</b>. If Vercel builds it, that&apos;s all; it redeploys by itself.
          </li>
          <li>
            <b>Downloaded it:</b> run <code>git pull</code>, then <code>pnpm install</code> and <code>pnpm bundle</code>, and restart.
          </li>
        </ul>
        <p className="update-keep">Your settings, countdowns and login stay as they are.</p>
      </details>
    </div>
  );
}
