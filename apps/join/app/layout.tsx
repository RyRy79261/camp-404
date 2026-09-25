import type { Metadata, Viewport } from "next";
import { Inter, Silkscreen } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
// The pixel face for the OS chrome: window titles, icon labels, headings.
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
  display: "swap",
});

// Short on purpose (owner, 2026-09-25): "Are you lost? Join 404".
const TITLE = "Join 404";
const DESCRIPTION = "Are you lost? Join 404.";

export const metadata: Metadata = {
  metadataBase: new URL("https://join.camp-404.com"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  openGraph: {
    type: "website",
    siteName: "Camp 404",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "oklch(0.15 0.05 295)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${silkscreen.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
