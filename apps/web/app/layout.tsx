import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "@camp404/ui/styles.css";

export const metadata: Metadata = {
  title: "Camp 404",
  description: "A calm command centre for a chaotic desert.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
