import type { NextConfig } from "next";

// join.camp-404.com is static: no database, no sign-in, no server code. A
// static export keeps it that way, since anything that needs a server fails
// the build.
const config: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  typedRoutes: true,
};

export default config;
