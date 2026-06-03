"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, User as UserIcon } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { buildTree, computeMatchIds, subtreeHasMatch } from "@camp404/core";
import type { ReferralUser, TreeNode } from "@camp404/types";

export function FamilyTree({
  roster,
  viewerUserId,
}: {
  roster: ReferralUser[];
  viewerUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    // Default: roots expanded one level so the page isn't a blank list.
    () => new Set(roster.filter((u) => !u.inviterId).map((u) => u.id)),
  );

  const trees = useMemo(() => buildTree(roster), [roster]);

  const matchIds = useMemo(
    () => computeMatchIds(roster, query),
    [roster, query],
  );

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
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or invite code…"
          className="h-12 pl-10"
        />
      </div>
      <div className="flex gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set(roster.map((u) => u.id)))}
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
        <div className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {query ? "No matches." : "No accounts yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
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
    </div>
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
            // A search match (accent) wins over the viewer's own border
            // (primary) so the two never fight; the "You" pill still marks self.
            isMatch && matchIds
              ? "border-accent"
              : isViewer
                ? "border-primary"
                : "",
          ].join(" ")}
        >
          <CardContent className="flex items-center gap-2.5 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {node.user.displayName ?? "(no name)"}
                </span>
                {node.user.rank === "captain" && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-micro font-semibold text-accent">
                    Captain
                  </span>
                )}
                {isViewer && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-micro font-semibold text-primary-foreground">
                    You
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {node.user.inviteCode
                  ? `via ${node.user.inviteCode}`
                  : "root"}
              </p>
            </div>
            {hasChildren && (
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-micro font-medium text-muted-foreground">
                {node.descendantCount} descendant
                {node.descendantCount === 1 ? "" : "s"}
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

