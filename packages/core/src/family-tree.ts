import type { ReferralUser, TreeNode } from "@camp404/types";

// Pure family-tree (referral graph) builders. CYCLE-GUARDED throughout (OD9):
// a cyclic `inviterId` chain (A→B→A — possible via manual DB edits, migrations,
// or corruption) must never produce a cyclic tree or an unbounded walk that
// hangs the client. "Domain-impossible" is not a sufficient defence.

/** Walk up the inviter chain from `startId`; true if `childId` is an ancestor
 *  (so attaching `child` under it would close a cycle). Self-bounded by `seen`. */
function isAncestor(
  childId: string,
  startId: string,
  parentId: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let cursor: string | null = startId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === childId) return true;
    seen.add(cursor);
    cursor = parentId.get(cursor) ?? null;
  }
  return false;
}

function setDescendantCount(node: TreeNode): number {
  let total = node.children.length;
  for (const child of node.children) total += setDescendantCount(child);
  node.descendantCount = total;
  return total;
}

/**
 * Build the referral forest from a flat roster. Roots are accounts with no
 * inviter. A back-edge that would create a cycle (or a self-parent) demotes the
 * node to a root instead of closing the loop, so the result is always acyclic —
 * safe for the recursive consumers below. `descendantCount` (all generations
 * below a node) is precomputed.
 */
export function buildTree(roster: readonly ReferralUser[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const u of roster) {
    byId.set(u.id, { user: u, children: [], descendantCount: 0 });
  }
  const parentId = new Map<string, string | null>(
    roster.map((u) => [u.id, u.inviterId]),
  );

  const roots: TreeNode[] = [];
  for (const u of roster) {
    const node = byId.get(u.id);
    if (!node) continue;
    const parent = u.inviterId ? byId.get(u.inviterId) : null;
    if (
      parent &&
      u.inviterId &&
      u.inviterId !== u.id &&
      !isAncestor(u.id, u.inviterId, parentId)
    ) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const root of roots) setDescendantCount(root);
  return roots;
}

/**
 * Ids matching `query` (over display name + invite code), with every ancestor
 * of a match promoted so the path to it stays visible. Returns null for an
 * empty query. Ancestor promotion is cycle-guarded.
 */
export function computeMatchIds(
  roster: readonly ReferralUser[],
  query: string,
): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const matches = new Set<string>();
  for (const u of roster) {
    const hay = `${u.displayName ?? ""} ${u.inviteCode ?? ""}`.toLowerCase();
    if (hay.includes(q)) matches.add(u.id);
  }

  const parentById = new Map<string, string | null>(
    roster.map((u) => [u.id, u.inviterId]),
  );
  for (const id of [...matches]) {
    const seen = new Set<string>(); // cycle guard for this ancestor walk
    let cursor = parentById.get(id) ?? null;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      matches.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }
  return matches;
}

/** Whether `node` or any descendant is in `matches` (tree is acyclic). */
export function subtreeHasMatch(node: TreeNode, matches: Set<string>): boolean {
  if (matches.has(node.user.id)) return true;
  return node.children.some((c) => subtreeHasMatch(c, matches));
}

/** "1 descendant" / "N descendants" — pluralised count label. */
export function descendantCountLabel(count: number): string {
  return `${count} ${count === 1 ? "descendant" : "descendants"}`;
}
