"use client";

import { useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
  Search,
  User as UserIcon,
} from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import {
  buildTree,
  computeLiteralMatchIds,
  computeMatchIds,
  descendantCountLabel,
  subtreeHasMatch,
} from "@camp404/core";
import type { ReferralUser, TreeNode } from "@camp404/types";

export function FamilyTree({
  roster,
  viewerUserId,
  showsInviteCodes = false,
}: {
  roster: ReferralUser[];
  viewerUserId: string;
  /**
   * The roster carries other members' invite codes (captains only; the server
   * removes them for everyone else). Only changes the search hint.
   */
  showsInviteCodes?: boolean;
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
  // Only the people the search found are highlighted. Their ancestors are
  // shown so the path is visible, but they did not match.
  const literalMatchIds = useMemo(
    () => computeLiteralMatchIds(roster, query),
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              showsInviteCodes
                ? "Search by name or invite code…"
                : "Search by name…"
            }
            aria-label="Search the family tree"
            className="pl-9"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => setExpanded(new Set(roster.map((u) => u.id)))}
          >
            <ChevronsUpDown aria-hidden />
            Expand all
          </Button>
          <Button variant="outline" onClick={() => setExpanded(new Set())}>
            <ChevronsDownUp aria-hidden />
            Collapse
          </Button>
        </div>
      </div>

      {visibleTrees.length === 0 ? (
        <EmptyState
          icon={<GitBranch aria-hidden />}
          title={query ? "No matches." : "No accounts yet."}
        />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <ul className="flex flex-col gap-1">
              {visibleTrees.map((node) => (
                <Branch
                  key={node.user.id}
                  node={node}
                  depth={0}
                  expanded={effectiveExpanded}
                  onToggle={toggle}
                  matchIds={matchIds}
                  literalMatchIds={literalMatchIds}
                  viewerUserId={viewerUserId}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
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
  literalMatchIds: Set<string> | null;
  viewerUserId: string;
  /** The parent row's name; absent on a root. */
  inviterName?: string;
}

function Branch({
  node,
  depth,
  expanded,
  onToggle,
  matchIds,
  literalMatchIds,
  viewerUserId,
  inviterName,
}: BranchProps) {
  const childrenId = useId();
  const isOpen = expanded.has(node.user.id);
  const isViewer = node.user.id === viewerUserId;
  const isMatch = literalMatchIds?.has(node.user.id) ?? false;
  const name = node.user.displayName ?? "(no name)";

  const visibleChildren = matchIds
    ? node.children.filter((c) => subtreeHasMatch(c, matchIds))
    : node.children;
  // During a search, children that don't match are filtered out of the render —
  // so the chevron/expand affordance must key off what's actually renderable,
  // or a matched leaf shows a chevron that expands to nothing.
  const hasChildren = visibleChildren.length > 0;

  return (
    <li>
      {/* One guide segment per level above this row, then the disclosure
          toggle, then the row itself. */}
      <div className="flex items-center">
        {Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className="flex w-6 shrink-0 justify-center self-stretch"
          >
            <span className="h-full w-px bg-border" />
          </span>
        ))}

        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.user.id)}
            aria-expanded={isOpen}
            aria-controls={isOpen ? childrenId : undefined}
            aria-label={`People ${name} invited`}
            className="flex h-11 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span
            aria-hidden
            className="flex h-11 w-6 shrink-0 items-center justify-center"
          >
            <span className="size-[5px] rounded-full bg-muted-foreground" />
          </span>
        )}

        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
            // A search match (accent) wins over the viewer's own border
            // (primary) so the two never fight; the "You" badge still marks self.
            isMatch
              ? "border-accent bg-accent/10"
              : isViewer
                ? "border-primary/60 bg-primary/5"
                : "border-transparent hover:bg-muted/40",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-foreground">
                {name}
              </span>
              {node.user.rank === "captain" && (
                <Badge className="shrink-0 bg-accent/15 text-accent">
                  Captain
                </Badge>
              )}
              {isViewer && <Badge className="shrink-0">You</Badge>}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {node.user.inviteCode
                ? `via ${node.user.inviteCode}`
                : inviterName
                  ? // A member does not receive other members' codes, so
                    // the line names who invited them instead.
                    `via ${inviterName}`
                  : "root"}
            </p>
          </div>
          {hasChildren && (
            <Badge
              variant="outline"
              className="shrink-0 normal-case tracking-normal"
            >
              {descendantCountLabel(node.descendantCount)}
            </Badge>
          )}
        </div>
      </div>

      {hasChildren && isOpen && (
        <ul id={childrenId} className="mt-1 flex flex-col gap-1">
          {visibleChildren.map((child) => (
            <Branch
              key={child.user.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              matchIds={matchIds}
              literalMatchIds={literalMatchIds}
              viewerUserId={viewerUserId}
              inviterName={name}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
