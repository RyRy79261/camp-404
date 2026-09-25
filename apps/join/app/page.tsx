import { Inter } from "next/font/google";
import { JoinPageView } from "@/components/join-page-view";
import { readJoinPage } from "@/lib/join-page";

// The join site's one page (#264): the camp's current year's published join
// page, read-only and public. Read on every visit, so a captain's Publish in
// the console shows here on the next load, with nothing to rebuild.
export const dynamic = "force-dynamic";

// The signed-out landing's face.
const inter = Inter({ subsets: ["latin"], display: "swap" });

export default async function JoinPage() {
  const read = await readJoinPage();
  return <JoinPageView read={read} fontClassName={inter.className} />;
}
