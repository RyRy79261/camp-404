import { InkblotProgram } from "@/components/os/inkblot-program";
import { requireMemberPage } from "@/lib/member-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "INKBLOT — Camp 404" };

/**
 * INKBLOT, the shared game from @camp404/games, opened from the Terminal
 * (`play inkblot`). Every approved member, the Terminal's own gate. It reads
 * and writes nothing of the camp's: its scores stay in this browser.
 */
export default async function InkblotPage() {
  await requireMemberPage();
  return (
    <div className="-mx-4 -my-6 h-[min(36rem,calc(100dvh-8rem))] bg-os-bg page-sm:-mx-6">
      <h1 className="sr-only">INKBLOT</h1>
      <InkblotProgram />
    </div>
  );
}
