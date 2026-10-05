import type { Metadata, Viewport } from "next";
import { interFont } from "@/lib/fonts/inter";
import { silkscreenFont } from "@/lib/fonts/silkscreen";
import { jetbrainsMonoFont } from "@/lib/fonts/jetbrains-mono";
import { montserratFont } from "@/lib/fonts/montserrat";
import { Toaster } from "@camp404/ui/components/toast";
import { Providers } from "./providers";
import { AcknowledgementGate } from "./acknowledgement-gate";
import { isE2ETestMode } from "@/lib/test-mode";
import { FeedbackGate } from "./feedback-gate";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { OS_SKIN_SCRIPT } from "@/lib/os-skin";
import { osThemeCss } from "@/lib/os-themes";

// The system themes' colours (lib/os-themes.ts), built once per server.
const OS_THEME_CSS = osThemeCss();

// Brand faces, exposed as CSS vars consumed by --font-sans / --font-mono in
// @camp404/ui globals.css. Montserrat is the AfrikaBurn app's face (body 500,
// headings up to 800); JetBrains Mono sets eyebrows and data. Self-hosted
// (apps/web/fonts/*, loaded in lib/fonts/*) rather than `next/font/google`, so `next build`
// makes no Google Fonts request.
const montserrat = montserratFont;
const jetbrainsMono = jetbrainsMonoFont;

// The 404 OS faces (owner's approval of the prototype, 2026-09-26, decision
// 10): Inter for body text and Silkscreen, the pixel face, for the chrome
// (window titles, icon labels, buttons, headings), as Join loads them. The
// desktop and the gate screens wear them (`data-os-skin`, globals.css); the
// sign-in pages keep Montserrat. Both self-hosted for the same reason.
const inter = interFont;
const silkscreen = silkscreenFont;

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
  // attributes on <html> before React hydrates, and for the OS skin's class
  // (lib/os-skin.ts), which the head script adds before React hydrates.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark camp-accent ${montserrat.variable} ${jetbrainsMono.variable} ${inter.variable} ${silkscreen.variable}`}
    >
      <head>
        {/* Sets the 404 OS skin's class on <html> while the page carries
            `data-os-skin` (lib/os-skin.ts), before the first paint. The
            class is not React's, which suppressHydrationWarning allows. */}
        <script dangerouslySetInnerHTML={{ __html: OS_SKIN_SCRIPT }} />
        {/* The 404 OS themes' colours: 404 Night on :root, each other theme
            on [data-os-theme], which only the desktop (and <html>, from the
            script above) carries. In the head, so the first paint is in the
            member's theme. Built from constants, never from input. */}
        <style dangerouslySetInnerHTML={{ __html: OS_THEME_CSS }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          {/* Asks for notices only while signed in, off print pages, and on
              a visible tab; testSession stands in for the session in E2E. */}
          <AcknowledgementGate testSession={isE2ETestMode()} />
          {/* The gate self-gates on the live client session; aiAvailable is a
              server-only env check passed down for the "Improve with AI" toggle. */}
          <FeedbackGate
            aiAvailable={!!process.env.ANTHROPIC_API_KEY}
            testSession={isE2ETestMode()}
          />
          {/* App-wide toast outlet. Inert until something calls toast().
              Lifted clear of the desktop's taskbar and pinned strip, and of a
              phone's bottom bar with its home indicator, so a toast never
              covers the tray, a pin or Home (--os-toast-bottom, globals.css).
              Never on paper or in a PDF. */}
          <Toaster className="bottom-[var(--os-toast-bottom,0px)] print:hidden" />
        </Providers>
      </body>
    </html>
  );
}
