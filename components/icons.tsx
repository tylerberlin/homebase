// One small icon family: 24px grid, 1.75 stroke, round caps. Decorative by default.
type P = { size?: number };
const base = (size = 16) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const SunIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
);
export const MoonIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);
export const AutoIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
  </svg>
);
export const ExternalIcon = ({ size = 12 }: P) => (
  <svg {...base(size)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const CopyIcon = ({ size = 12 }: P) => (
  <svg {...base(size)}>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);
export const CheckIcon = ({ size = 12 }: P) => (
  <svg {...base(size)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const DisplayIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </svg>
);
export const FullscreenIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </svg>
);
export const CloseIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ChevronIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const PinIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const HomeIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
  </svg>
);
export const KeyIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2" />
  </svg>
);
export const LogoutIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
  </svg>
);
export const SettingsIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);
export const ArrowUpIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const ArrowDownIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
export const PlusIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
// Player buttons: filled, so they read at a glance.
export const PlayIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" />
  </svg>
);
export const PauseIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
);
export const NextIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M4 6.3v11.4a1 1 0 0 0 1.55.83L13 13.6v4.1a1 1 0 0 0 1.55.83l8.2-5.7a1 1 0 0 0 0-1.66l-8.2-5.7A1 1 0 0 0 13 6.3v4.1L5.55 5.47A1 1 0 0 0 4 6.3Z" transform="translate(-1.5 0)" />
  </svg>
);
export const PrevIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none" style={{ transform: "scaleX(-1)" }}>
    <path d="M4 6.3v11.4a1 1 0 0 0 1.55.83L13 13.6v4.1a1 1 0 0 0 1.55.83l8.2-5.7a1 1 0 0 0 0-1.66l-8.2-5.7A1 1 0 0 0 13 6.3v4.1L5.55 5.47A1 1 0 0 0 4 6.3Z" transform="translate(-1.5 0)" />
  </svg>
);
export const MusicIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </svg>
);
