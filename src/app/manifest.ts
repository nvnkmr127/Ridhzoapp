import type { MetadataRoute } from "next";

// PWA manifest — makes the web app installable on phones (Add to Home Screen),
// so it launches standalone like Ridhzo's native app. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ridhzo CRM",
    short_name: "Ridhzo",
    description: "Lead capture, instant alerts, and one-tap messaging.",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    categories: ["business", "productivity"],
    icons: [
      { src: "/logos/Ridhzo-Logo-Final_AppIcon-Dark.png", sizes: "any", type: "image/png", purpose: "any" },
      { src: "/logos/Ridhzo-Logo-Final_AppIcon-Dark.png", sizes: "any", type: "image/png", purpose: "maskable" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
