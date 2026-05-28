import { redirect } from "next/navigation";
import { getReferralRoster } from "@camp404/db/relations";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";

// Reads the Neon Auth session cookie on every request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Family tree — Camp 404",
};

interface TreeNode {
  user: {
    id: string;
    displayName: string | null;
    rank: "captain" | "member";
    inviteCode: string | null;
  };
  children: TreeNode[];
}

export default async function FamilyTreePage() {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const roster = await getReferralRoster();
  const tree = buildTree(roster);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-zinc-100">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Family tree</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Who brought who onto Camp 404. Roots are accounts that pre-date
          the invite system; every other branch is one invite code redemption.
        </p>
      </header>

      {tree.length === 0 ? (
        <p className="text-sm text-zinc-400">No accounts yet.</p>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <TreeBranch key={node.user.id} node={node} depth={0} />
          ))}
        </ul>
      )}
    </main>
  );
}

function TreeBranch({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <li>
      <div
        className="flex items-baseline gap-3 rounded border border-zinc-800 px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="text-sm font-medium">
          {node.user.displayName ?? "(no name)"}
        </span>
        {node.user.rank === "captain" && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
            Captain
          </span>
        )}
        {node.user.inviteCode && (
          <span className="ml-auto text-xs text-zinc-500">
            via <code className="text-zinc-300">{node.user.inviteCode}</code>
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeBranch key={child.user.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function buildTree(
  roster: Awaited<ReturnType<typeof getReferralRoster>>,
): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const u of roster) {
    byId.set(u.id, {
      user: {
        id: u.id,
        displayName: u.displayName,
        rank: u.rank,
        inviteCode: u.inviteCode,
      },
      children: [],
    });
  }
  const roots: TreeNode[] = [];
  for (const u of roster) {
    const node = byId.get(u.id);
    if (!node) continue;
    const parent = u.inviterId ? byId.get(u.inviterId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
