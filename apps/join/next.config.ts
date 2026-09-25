import type { NextConfig } from "next";

// The join site (join.camp-404.com, #264): one public page, read-only from the
// camp's database. Its own Vercel project, so a change to the console does not
// rebuild it and a change here does not rebuild the console (vercel.json).
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@camp404/ui", "@camp404/types", "@camp404/core"],
  typedRoutes: true,
};

export default config;
