import type { Metadata, Viewport } from "next";
import "@camp404/ui/styles.css";
import { JOIN_URL } from "@/lib/site";

const DESCRIPTION = "How to join Camp 404.";

export const metadata: Metadata = {
  metadataBase: new URL(JOIN_URL),
  title: "How to join — Camp 404",
  description: DESCRIPTION,
  applicationName: "Camp 404",
  openGraph: {
    type: "website",
    siteName: "Camp 404",
    title: "How to join — Camp 404",
    description: DESCRIPTION,
    url: "/",
    locale: "en_GB",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The landing's midnight violet, so the browser chrome matches the page.
  themeColor: "#0d061e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dark, like the signed-out landing. The page sets the landing's palette and
  // face on itself (components/join-page-view.tsx).
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
