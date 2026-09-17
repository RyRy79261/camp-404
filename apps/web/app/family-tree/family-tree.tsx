"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, User as UserIcon } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
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
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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
          className="pl-10"
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
              literalMatchIds={literalMatchIds}
              viewerUserId={viewerUserId}
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
      {/* Board S16: one 20px guide segment per level above this row, then a
          22px toggle, then the card. */}
      <div className="flex items-center">
        {Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className="flex w-5 shrink-0 justify-center self-stretch"
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
            className="flex h-11 w-[22px] shrink-0 items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="flex h-11 w-[22px] shrink-0 items-center justify-center"
          >
            <span className="size-[5px] rounded-full bg-muted-foreground" />
          </span>
        )}

        <Card
          className={[
            "flex-1 transition-colors",
            // A search match (accent) wins over the viewer's own border
            // (primary) so the two never fight; the "You" pill still marks self.
            isMatch ? "border-accent" : isViewer ? "border-primary" : "",
          ].join(" ")}
        >
          <CardContent className="flex items-center gap-2.5 px-3 py-2">
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted">
              <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {name}
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
                  : inviterName
                    ? // A member does not receive other members' codes, so
                      // the line names who invited them instead.
                      `via ${inviterName}`
                    : "root"}
              </p>
            </div>
            {hasChildren && (
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-micro font-medium text-muted-foreground">
                {descendantCountLabel(node.descendantCount)}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {hasChildren && isOpen && (
        <ul id={childrenId} className="mt-2 space-y-2">
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

