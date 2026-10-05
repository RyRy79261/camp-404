import type { Metadata } from "next";

// The sign-in, sign-up and password pages are public but are no answer to a
// search: a crawler may follow their links and keeps none of them.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
