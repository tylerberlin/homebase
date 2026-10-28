// The app icon: three server slabs on a blue glass tile. One source for the favicon,
// the header logo and the home-screen PNGs.
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<rect width="64" height="64" rx="15" fill="url(#s)"/>
<rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
<g fill="#fff" fill-opacity=".94">
<rect x="14" y="15" width="36" height="9.5" rx="3.2"/>
<rect x="14" y="27.25" width="36" height="9.5" rx="3.2"/>
<rect x="14" y="39.5" width="36" height="9.5" rx="3.2"/>
</g>
<g fill="#1e5fe0"><rect x="18.5" y="18.75" width="10" height="2" rx="1"/><rect x="18.5" y="31" width="10" height="2" rx="1"/><rect x="18.5" y="43.25" width="10" height="2" rx="1"/></g>
<g fill="#1fb866"><circle cx="44.5" cy="19.75" r="1.9"/><circle cx="44.5" cy="32" r="1.9"/><circle cx="44.5" cy="44.25" r="1.9"/></g>
</svg>`;

export const ICON_PNG_SIZES = [180, 192, 512] as const;
