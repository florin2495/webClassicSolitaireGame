import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Shown in the menu. Bump package.json "version" (patch) on every push to main.
  // Served at games.hailatat.icu/classicsolitaire (the hub proxies /classicsolitaire/* here, Next.js multi-zones).
  basePath: "/classicsolitaire",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_BASE_PATH: "/classicsolitaire" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
