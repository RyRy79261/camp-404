import type { MetadataRoute } from "next";

// PWA / Android web app manifest. Next auto-links this at
// /manifest.webmanifest. The SVG icon scales to every launcher size.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camp 404",
    short_name: "Camp 404",
    description: "A calm command centre for a chaotic desert.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d061e",
    theme_color: "#0d061e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
