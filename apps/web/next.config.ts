import type { NextConfig } from "next";

const isMobileBuild = process.env.MOBILE_BUILD === "1";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@camp404/ui", "@camp404/types", "@camp404/ai-prompts"],
  experimental: {
    typedRoutes: true,
  },
  ...(isMobileBuild
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default config;
