import type { NextConfig } from "next";

// The join site (join.camp-404.com, #264): one public page, built in code, with
// no database and no sign-in. Its own Vercel project, so a change to the
// console does not rebuild it and a change here does not rebuild the console
// (vercel.json).
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@camp404/ui"],
  typedRoutes: true,
};

export default config;
