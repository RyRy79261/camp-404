// The page is a client component, which cannot export metadata, so its title
// lives here.
export const metadata = { title: "Connect Claude — Camp 404" };

export default function MCPConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
