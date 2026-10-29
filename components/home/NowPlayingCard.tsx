"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NowPlaying, NowPlayingResult } from "@/lib/home/nowPlaying";
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "../icons";

// What's playing, with its cover, and play/pause and skip when the player allows it (the agent on a
// Mac or Linux machine). Hidden when nothing is playing.

const POLL = 5000;

const DEMO: NowPlaying = {
  state: "playing",
  title: "The Power of Love",
  artist: "Huey Lewis & the News",
  album: "Back to the Future",
  duration: 233,
  position: 88,
  at: 0,
  device: "Mac",
  app: "Music",
  controls: true,
};

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function useNowPlaying(demo: boolean) {
  const [np, setNp] = useState<NowPlaying | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    if (document.hidden) return;
    try {
      const r = await fetch("/api/now-playing", { cache: "no-store" });
      if (r.ok) {
        const d = (await r.json()) as NowPlayingResult;
        setNp(d.playing);
        if (!d.configured) return; // nothing set up: stop asking
      }
    } catch {
      // keep what's showing; try again next time
    }
    timer.current = setTimeout(load, POLL);
  }, []);

  useEffect(() => {
    if (demo) {
      setNp({ ...DEMO, at: Date.now() });
      return;
    }
    load();
    const onVis = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [demo, load]);

  return [np, setNp, load] as const;
}

export default function NowPlayingCard({ demo }: { demo: boolean }) {
  const [np, setNp, reload] = useNowPlaying(demo);
  const [tick, setTick] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artFailed, setArtFailed] = useState<string | null>(null);

  // Move the progress bar along between polls.
  const playing = np?.state === "playing";
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playing]);

  if (!np) return null;

  const elapsed = np.position != null ? Math.min(np.duration ?? Infinity, np.position + (playing ? Math.max(0, tick - np.at) / 1000 : 0)) : null;
  const pct = elapsed != null && np.duration ? Math.min(100, (elapsed / np.duration) * 100) : null;
  const showArt = !!np.art && artFailed !== np.art;

  const send = async (action: "playpause" | "next" | "previous") => {
    setError(null);
    if (demo) {
      if (action === "playpause") setNp({ ...np, state: playing ? "paused" : "playing", position: elapsed ?? 0, at: Date.now() });
      else setNp({ ...np, position: 0, at: Date.now() });
      return;
    }
    setBusy(true);
    // Flip the button straight away; the next report confirms it.
    if (action === "playpause") setNp({ ...np, state: playing ? "paused" : "playing", position: elapsed ?? np.position, at: Date.now() });
    try {
      const r = await fetch("/api/now-playing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: np.device, action }),
      });
      const d = (await r.json().catch(() => ({}))) as NowPlayingResult & { error?: string };
      if (!r.ok) setError(d.error ?? "That didn't work");
      else setNp(d.playing);
    } catch {
      setError("Couldn't reach the dashboard");
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <section className={`card home-card np ${playing ? "is-playing" : "is-paused"}`} id="music" aria-label="Now playing">
      {showArt && (
        <div className="np-bg" aria-hidden="true">
          <div className="np-glow" style={{ backgroundImage: `url("${np.art}")` }} />
        </div>
      )}
      <div className="card-title-row">
        <h3>Now playing</h3>
        <span className="np-src">
          <span className="np-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {np.device === np.app ? np.device : `${np.device} · ${np.app}`}
        </span>
      </div>
      <div className="np-main">
        <div className="np-art">
          {showArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={np.art} alt={np.album ? `Cover of ${np.album}` : ""} onError={() => setArtFailed(np.art!)} />
          ) : (
            <span className="np-art-blank">
              <MusicIcon size={28} />
            </span>
          )}
        </div>
        <div className="np-info">
          <p className="np-title" title={np.title}>
            {np.title}
          </p>
          <p className="np-artist" title={[np.artist, np.album].filter(Boolean).join(" — ")}>
            {np.artist}
            {np.album && np.album !== np.title && <span className="np-album"> — {np.album}</span>}
          </p>
          {pct != null && elapsed != null && (
            <div className="np-time">
              <div className="np-bar" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(np.duration!)} aria-valuenow={Math.round(elapsed)} aria-valuetext={`${clock(elapsed)} of ${clock(np.duration!)}`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <span className="np-times mono">
                <span>{clock(elapsed)}</span>
                <span>−{clock(np.duration! - elapsed)}</span>
              </span>
            </div>
          )}
          {np.controls ? (
            <div className="np-controls" role="group" aria-label="Playback">
              <button type="button" className="np-btn" onClick={() => send("previous")} disabled={busy} aria-label="Previous song">
                <PrevIcon size={18} />
              </button>
              <button type="button" className="np-btn np-play" onClick={() => send("playpause")} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
              </button>
              <button type="button" className="np-btn" onClick={() => send("next")} disabled={busy} aria-label="Next song">
                <NextIcon size={18} />
              </button>
            </div>
          ) : (
            <p className="np-note">Controls work when it&apos;s playing on a computer with the agent.</p>
          )}
          {error && (
            <p className="np-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
