import type { Metadata, Viewport } from "next";
import { Alegreya_Sans, Alfa_Slab_One, Anton, Chakra_Petch, Cinzel, Creepster, Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Mountains_of_Christmas, Orbitron, Pacifico, Press_Start_2P, Rajdhani, Share_Tech_Mono, Tiny5, VT323 } from "next/font/google";
import { lookScript } from "@/lib/settings";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
// The game themes' fonts (Settings → Look → Theme). Not preloaded: a font only downloads once a theme uses it.
const pixel = Tiny5({ subsets: ["latin"], weight: "400", variable: "--font-pixel", preload: false });
const arcade = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-arcade", preload: false });
const terminal = VT323({ subsets: ["latin"], weight: "400", variable: "--font-terminal", preload: false });
const neon = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-neon", preload: false });
const hud = Chakra_Petch({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-hud", preload: false });
const ancient = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-ancient", preload: false });
const ancientBody = Alegreya_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-ancient-body", preload: false });
const drop = Anton({ subsets: ["latin"], weight: "400", variable: "--font-drop", preload: false });
const led = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: "--font-led", preload: false });
const hyper = Orbitron({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-hyper", preload: false });
const slab = Alfa_Slab_One({ subsets: ["latin"], weight: "400", variable: "--font-slab", preload: false });
const spooky = Creepster({ subsets: ["latin"], weight: "400", variable: "--font-spooky", preload: false });
const harvest = Fraunces({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-harvest", preload: false });
const snow = Mountains_of_Christmas({ subsets: ["latin"], weight: "700", variable: "--font-snow", preload: false });
const script = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-script", preload: false });

export const metadata: Metadata = {
  title: "Homebase",
  description: "Live status for NAS and pi",
  icons: { icon: "/brand/icon.svg", apple: "/brand/icon-180.png" },
  appleWebApp: { capable: true, title: "Homebase", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // let the glow run under the phone's status bar; .wrap pads for the safe area
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dfe9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#050a18" },
  ],
};

// Applies the remembered theme and look before first paint so there's no light/dark or color flash.
// data-mode is always the light or dark actually showing (the picked theme, or the system's), so
// themes with a light and a dark version need one selector each rather than a media query and a pick.
const themeScript = `try{var r=document.documentElement,t=localStorage.getItem("bd-theme");if(t)r.dataset.theme=t;var q=matchMedia("(prefers-color-scheme: dark)"),u=function(){r.dataset.mode=r.dataset.theme||(q.matches?"dark":"light")};u();q.addEventListener("change",u);window.__bdMode=u}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[sans, mono, pixel, arcade, terminal, neon, hud, ancient, ancientBody, drop, led, hyper, slab, spooky, harvest, snow, script].map((f) => f.variable).join(" ")} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + lookScript }} />
      </head>
      {/* browser extensions (e.g. Grammarly) add attributes to <body> before hydration */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
