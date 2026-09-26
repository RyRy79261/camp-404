import { TerminalProgram } from "@/components/os/terminal-program";
import { rankLabel } from "@/lib/camp-roster";
import { requireMemberPage } from "@/lib/member-gate";
import { getProgramManifest } from "@/lib/program-manifest";
import { terminalContext } from "@/lib/terminal-commands";
import { isTeamLead } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Terminal — Camp 404" };

/**
 * The Terminal (owner, 2026-09-25: "We do need the terminal"), for every
 * approved member. Its commands read and write no data: they run over the
 * member's own manifest (request-cached; the layout built it already), so
 * `open` reaches only programs they have an icon for.
 */
export default async function TerminalPage() {
  const { campUser, authUser } = await requireMemberPage();
  const [manifest, lead] = await Promise.all([
    getProgramManifest(),
    isTeamLead(campUser.id),
  ]);
  const context = terminalContext(
    manifest ?? { programs: [], folders: [], startMenu: [] },
    {
      name: campUser.displayName ?? authUser.primaryEmail ?? "burner",
      rank: rankLabel(campUser.rank, lead),
    },
  );

  return (
    <div className="-mx-4 -my-6 min-h-96 bg-os-bg page-sm:-mx-6">
      <h1 className="sr-only">Terminal</h1>
      <TerminalProgram context={context} />
    </div>
  );
}
