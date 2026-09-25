import { Os } from "@/components/os/os";
import { loadJoinData } from "@/lib/load-join-data";

// A captain's edit shows within a minute: the page is rebuilt in the
// background at most once every 60 seconds, with no cron and no redeploy.
export const revalidate = 60;

export default async function Page() {
  return <Os data={await loadJoinData()} />;
}
