import type { MetadataRoute } from "next";

// Its own installable app (separate from the haiLaTăticu hub app): own id and scope "/classicsolitaire", so on Android
// it gets its own icon and opens straight into the game, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Classic Solitaire",
    short_name: "Solitaire", // launcher label: "Classic Solitaire" (17 chars) gets cut on Android home screens
    description: "Pasiența clasică Klondike. Fără reclame, merge și fără internet.",
    id: "/classicsolitaire/",
    start_url: "/classicsolitaire",
    scope: "/classicsolitaire",
    display: "standalone",
    orientation: "any",
    lang: "ro",
    background_color: "#0b7a2e",
    theme_color: "#0b7a2e",
    icons: [
      { src: "/classicsolitaire/pwa-icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/classicsolitaire/pwa-icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/classicsolitaire/pwa-icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
