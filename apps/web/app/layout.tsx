import type { Metadata, Viewport } from "next";
import {
  Inter,
  JetBrains_Mono,
  Montserrat,
  Silkscreen,
} from "next/font/google";
import { Toaster } from "@camp404/ui/components/toast";
import { Providers } from "./providers";
import { AcknowledgementGate } from "./acknowledgement-gate";
import { FeedbackGate } from "./feedback-gate";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

// Brand faces, exposed as CSS vars consumed by --font-sans / --font-mono in
// @camp404/ui globals.css. Montserrat is the AfrikaBurn app's face (body 500,
// headings up to 800); JetBrains Mono sets eyebrows and data.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-brand",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-brand-mono",
  display: "swap",
});

// The 404 OS faces (owner's approval of the prototype, 2026-09-26, decision
// 10): Inter for body text and Silkscreen, the pixel face, for the chrome
// (window titles, icon labels, buttons, headings), as Join loads them. The
// desktop and the gate screens wear them (`data-os-skin`, globals.css); the
// sign-in pages keep Montserrat.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
  display: "swap",
});

const SITE_DESCRIPTION = "A calm command centre for a chaotic desert.";

export const metadata: Metadata = {
  // Absolute base for og:image / twitter:image / canonical URLs. The
  // file-based opengraph-image.tsx and twitter-image.tsx routes resolve
  // against this, as do the icon.svg / apple-icon.tsx entries.
  metadataBase: new URL(SITE_URL),
  title: "Camp 404",
  description: SITE_DESCRIPTION,
  applicationName: "Camp 404",
  openGraph: {
    type: "website",
    siteName: "Camp 404",
    title: "Camp 404",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Camp 404",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#17191b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dark-first, wearing the Camp 404 accent skin over AfrikaBurn's surfaces.
  // The class is fixed here; nothing on the client changes it any more.
  // suppressHydrationWarning stays for browser extensions that stamp
  // attributes on <html> before React hydrates.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark camp-accent ${montserrat.variable} ${jetbrainsMono.variable} ${inter.variable} ${silkscreen.variable}`}
    >
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <AcknowledgementGate />
          {/* The gate self-gates on the live client session; aiAvailable is a
              server-only env check passed down for the "Improve with AI" toggle. */}
          <FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} />
          {/* App-wide toast outlet. Inert until something calls toast().
              Lifted clear of the desktop's taskbar and pinned strip, and of a
              phone's bottom bar with its home indicator, so a toast never
              covers the tray, a pin or Home (--os-toast-bottom, globals.css). */}
          <Toaster className="bottom-[var(--os-toast-bottom,0px)]" />
        </Providers>
      </body>
    </html>
  );
}
