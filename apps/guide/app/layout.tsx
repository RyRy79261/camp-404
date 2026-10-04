import type { Metadata, Viewport } from "next";
import { GUIDE_SITE_URL } from "@camp404/types";
import "./globals.css";

// survival-guide.camp-404.com (#250): the Survival Guide's public sections.
// No sign-in. noindex everywhere (owner, 2026-10-04): a search cache would
// outlive an unpublish.

const TITLE = "Survival Guide · Camp 404";
const DESCRIPTION =
  "What Camp 404 has learnt about getting to the Tankwa Karoo, living in the dust for a week, and leaving it as we found it.";

export const metadata: Metadata = {
  metadataBase: new URL(GUIDE_SITE_URL),
  title: { default: TITLE, template: "%s · Camp 404 Survival Guide" },
  description: DESCRIPTION,
  applicationName: "Camp 404 Survival Guide",
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    siteName: "Camp 404",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d061e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <head>
        <link
          rel="preload"
          href="/fonts/inter.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/silkscreen.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
