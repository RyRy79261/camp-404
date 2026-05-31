import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { AcknowledgementGate } from "./acknowledgement-gate";
import { FeedbackGate } from "./feedback-gate";
import "@camp404/ui/styles.css";

const SITE_URL = "https://camp-404.com";
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
  themeColor: "#0d061e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // next-themes (via NeonAuthUIProvider) sets class="dark" on <html> on the
  // client; suppressHydrationWarning silences the resulting attribute mismatch.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <AcknowledgementGate />
          {/* The gate self-gates on the live client session; aiAvailable is a
              server-only env check passed down for the "Improve with AI" toggle. */}
          <FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} />
        </Providers>
      </body>
    </html>
  );
}
