"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, User as UserIcon } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";

export interface TreeUser {
  id: string;
  displayName: string | null;
  rank: "captain" | "member";
  inviteCode: string | null;
  inviterId: string | null;
}

interface TreeNode {
  user: TreeUser;
  children: TreeNode[];
}

export function FamilyTree({
  roster,
  viewerUserId,
}: {
  roster: TreeUser[];
  viewerUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    // Default: roots expanded one level so the page isn't a blank list.
    () => new Set(roster.filter((u) => !u.inviterId).map((u) => u.id)),
  );

  const trees = useMemo(() => buildTree(roster), [roster]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set<string>();
    for (const u of roster) {
      const hay = `${u.displayName ?? ""} ${u.inviteCode ?? ""}`.toLowerCase();
      if (hay.includes(q)) matches.add(u.id);
    }
    // Promote ancestors of every match so the path stays visible.
    const parentById = new Map(roster.map((u) => [u.id, u.inviterId]));
    for (const id of [...matches]) {
      let cursor = parentById.get(id) ?? null;
      while (cursor) {
        matches.add(cursor);
        cursor = parentById.get(cursor) ?? null;
      }
    }
    return matches;
  }, [query, roster]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // When a search query produces matches, force the matching path
  // expanded. Without this, a child match nested inside a collapsed
  // ancestor stays hidden.
  const effectiveExpanded = useMemo(() => {
    if (!matchIds) return expanded;
    const merged = new Set(expanded);
    for (const id of matchIds) merged.add(id);
    return merged;
  }, [expanded, matchIds]);

  const visibleTrees = matchIds
    ? trees.filter((t) => subtreeHasMatch(t, matchIds))
    : trees;

  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or invite code…"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setExpanded(new Set(roster.map((u) => u.id)))
          }
        >
          Expand all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set())}
        >
          Collapse
        </Button>
      </div>

      {visibleTrees.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {query ? "No matches." : "No accounts yet."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {visibleTrees.map((node) => (
            <Branch
              key={node.user.id}
              node={node}
              depth={0}
              expanded={effectiveExpanded}
              onToggle={toggle}
              matchIds={matchIds}
              viewerUserId={viewerUserId}
              isLastChild
            />
          ))}
        </ul>
      )}
    </>
  );
}

interface BranchProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  matchIds: Set<string> | null;
  viewerUserId: string;
  isLastChild: boolean;
}

function Branch({
  node,
  depth,
  expanded,
  onToggle,
  matchIds,
  viewerUserId,
  isLastChild,
}: BranchProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.user.id);
  const isViewer = node.user.id === viewerUserId;
  const isMatch = matchIds?.has(node.user.id) ?? false;

  const visibleChildren = matchIds
    ? node.children.filter((c) => subtreeHasMatch(c, matchIds))
    : node.children;

  return (
    <li className="relative">
      <div
        className="flex items-stretch"
        style={{ paddingLeft: depth * 20 }}
      >
        {/* Vertical guide line on the left of every non-root row,
            with an elbow joining the row's badge. Pure CSS — no SVG
            needed for the simple tree case. */}
        {depth > 0 && (
          <>
            <span
              aria-hidden
              className="absolute border-l border-border"
              style={{
                left: (depth - 1) * 20 + 18,
                top: 0,
                bottom: isLastChild ? "50%" : 0,
              }}
            />
            <span
              aria-hidden
              className="absolute border-t border-border"
              style={{
                left: (depth - 1) * 20 + 18,
                width: 14,
                top: 22,
              }}
            />
          </>
        )}

        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.user.id)}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className="flex h-11 w-6 items-center justify-center text-muted-foreground disabled:opacity-30"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          )}
        </button>

        <Card
          className={[
            "flex-1 transition-colors",
            isViewer ? "ring-1 ring-primary" : "",
            isMatch && matchIds ? "border-amber-400/60" : "",
          ].join(" ")}
        >
          <CardContent className="flex items-center gap-3 p-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-muted/40">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">
                  {node.user.displayName ?? "(no name)"}
                </span>
                {node.user.rank === "captain" && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Captain
                  </span>
                )}
                {isViewer && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    You
                  </span>
                )}
              </div>
              {node.user.inviteCode && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  via <span className="font-mono">{node.user.inviteCode}</span>
                </p>
              )}
            </div>
            {hasChildren && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                {countDescendants(node)}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {hasChildren && isOpen && visibleChildren.length > 0 && (
        <ul className="mt-2 space-y-2">
          {visibleChildren.map((child, idx) => (
            <Branch
              key={child.user.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              matchIds={matchIds}
              viewerUserId={viewerUserId}
              isLastChild={idx === visibleChildren.length - 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function buildTree(roster: TreeUser[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const u of roster) byId.set(u.id, { user: u, children: [] });
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

function subtreeHasMatch(node: TreeNode, matches: Set<string>): boolean {
  if (matches.has(node.user.id)) return true;
  return node.children.some((c) => subtreeHasMatch(c, matches));
}

function countDescendants(node: TreeNode): number {
  let n = 0;
  const walk = (t: TreeNode) => {
    n += t.children.length;
    for (const c of t.children) walk(c);
  };
  walk(node);
  return n;
}
