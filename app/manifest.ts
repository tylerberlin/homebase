import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" install the dashboard like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Homebase",
    short_name: "Homebase",
    description: "Live status for NAS and pi",
    start_url: "/",
    display: "standalone",
    background_color: "#050a18",
    theme_color: "#050a18",
    icons: [
      { src: "/brand/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
