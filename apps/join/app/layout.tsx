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

const DESCRIPTION =
  "Camp 404 is a theme camp at AfrikaBurn: a place for the lost. Boot up 404 OS and apply to join.";

export const metadata: Metadata = {
  metadataBase: new URL("https://join.camp-404.com"),
  title: "404 OS · Join Camp 404",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Camp 404",
    title: "404 OS · Join Camp 404",
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
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
