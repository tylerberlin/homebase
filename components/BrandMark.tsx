// The app icon drawn inline, so each theme can recolor it (--logo-a/--logo-b, defaulting to the
// blue in lib/brand.ts). The favicon and home-screen icons stay the fixed blue version.
export default function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--logo-a, #2f6bff)" />
          <stop offset="1" stopColor="var(--logo-b, #38bdf8)" />
        </linearGradient>
        <linearGradient id="bm-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#bm-g)" />
      <rect width="64" height="64" rx="15" fill="url(#bm-s)" />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
      <g fill="#fff" fillOpacity=".94">
        <rect x="14" y="15" width="36" height="9.5" rx="3.2" />
        <rect x="14" y="27.25" width="36" height="9.5" rx="3.2" />
        <rect x="14" y="39.5" width="36" height="9.5" rx="3.2" />
      </g>
      <g fill="var(--logo-ink, #1e5fe0)">
        <rect x="18.5" y="18.75" width="10" height="2" rx="1" />
        <rect x="18.5" y="31" width="10" height="2" rx="1" />
        <rect x="18.5" y="43.25" width="10" height="2" rx="1" />
      </g>
      <g fill="#1fb866">
        <circle cx="44.5" cy="19.75" r="1.9" />
        <circle cx="44.5" cy="32" r="1.9" />
        <circle cx="44.5" cy="44.25" r="1.9" />
      </g>
    </svg>
  );
}
