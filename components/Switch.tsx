"use client";

/** On/off switch (a button with role="switch"), used in Settings and the Home tab's edit mode. */
export default function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}
