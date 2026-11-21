import type { MetadataRoute } from "next";

// Its own installable app (separate from the haiLaTăticu hub app): own id and scope "/solitaire", so on Android
// it gets its own icon and opens straight into the game, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solitaire",
    short_name: "Solitaire",
    description: "Pasiența clasică Klondike. Fără reclame, merge și fără internet.",
    id: "/solitaire/",
    start_url: "/solitaire",
    scope: "/solitaire",
    display: "standalone",
    orientation: "any",
    lang: "ro",
    background_color: "#0b7a2e",
    theme_color: "#0b7a2e",
    icons: [
      { src: "/solitaire/pwa-icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/solitaire/pwa-icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/solitaire/pwa-icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
