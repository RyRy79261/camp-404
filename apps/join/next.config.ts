import type { NextConfig } from "next";

// join.camp-404.com renders on its own server so it can read the camp's
// database (owner, 2026-09-25); each page refreshes every 60 seconds.
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@camp404/types",
    "@camp404/core",
    "@camp404/os",
    "@camp404/games",
  ],
  typedRoutes: true,
};

export default config;
