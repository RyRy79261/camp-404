import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { AcknowledgementGate } from "./acknowledgement-gate";
import { FeedbackGate } from "./feedback-gate";
import { getAuthenticatedUser } from "@/lib/auth";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the feedback button/shake on being signed in. Wrapped so a transient
  // auth failure only hides the button rather than breaking every page.
  let signedIn = false;
  try {
    signedIn = !!(await getAuthenticatedUser());
  } catch {
    // A transient auth error just hides the button; don't break the layout.
  }

  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <AcknowledgementGate />
          <FeedbackGate
            signedIn={signedIn}
            aiAvailable={!!process.env.ANTHROPIC_API_KEY}
          />
        </Providers>
      </body>
    </html>
  );
}
