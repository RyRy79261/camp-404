"use client";

import * as React from "react";
import { Lock, RefreshCw, Settings, UserRound } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Rank model for the control panel. UI-local on purpose: the app derives a
 * viewer's rank from their `Role` and team-lead assignments (a camp member
 * becomes `team_lead` by being made lead of a team group). Kept separate
 * from the `Role` enum in `@camp404/types` until that derivation is settled.
 */
export type ControlPanelRank = "camp_member" | "team_lead" | "captain";

/** Ordered low → high. The index doubles as the rank's clearance level. */
const RANK_ORDER: ControlPanelRank[] = ["camp_member", "team_lead", "captain"];

export const RANK_LABEL: Record<ControlPanelRank, string> = {
  camp_member: "Camp Member",
  team_lead: "Team Lead",
  captain: "Captain",
};

function rankLevel(rank: ControlPanelRank): number {
  return RANK_ORDER.indexOf(rank);
}

export type ControlPanelCorner = "tl" | "tr" | "bl" | "br";

export interface ControlPanelQuadrant {
  label: string;
  /** Optional sub-label shown beneath the title. */
  hint?: string;
  /** When set, the tile renders as a link. Otherwise `onQuadrantSelect` fires. */
  href?: string;
  icon?: React.ReactNode;
}

export interface ControlPanelLayer {
  /** Minimum rank required to interact with this layer's quadrants. */
  rank: ControlPanelRank;
  topLeft: ControlPanelQuadrant;
  topRight: ControlPanelQuadrant;
  bottomLeft: ControlPanelQuadrant;
  bottomRight: ControlPanelQuadrant;
}

export interface ControlPanelProps {
  /** Ordered low → high rank. Typically three: member, team lead, captain. */
  layers: ControlPanelLayer[];
  /** The viewing camp member's rank — decides which layers are unlocked. */
  viewerRank?: ControlPanelRank;
  /** Layer shown first. Defaults to 0 (personal context). */
  initialLayer?: number;
  /** Right-hand header slot — login state, settings, etc. */
  header?: React.ReactNode;
  onLayerChange?: (index: number, layer: ControlPanelLayer) => void;
  onQuadrantSelect?: (
    quadrant: ControlPanelQuadrant,
    corner: ControlPanelCorner,
    layer: ControlPanelLayer,
  ) => void;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Camp 404's layered four-quadrant control panel. Each layer is a 2×2 grid
 * with a circular centre button; tapping the circle cycles to the next layer
 * (member → team lead → captain → member). Layers above the viewer's rank
 * stay visible but locked — the UI is browsable, the tiles are not.
 */
export function ControlPanel({
  layers,
  viewerRank = "camp_member",
  initialLayer = 0,
  header,
  onLayerChange,
  onQuadrantSelect,
  className,
}: ControlPanelProps) {
  const [active, setActive] = React.useState(() =>
    clamp(initialLayer, 0, Math.max(layers.length - 1, 0)),
  );

  const layer = layers[active];
  if (!layer) return null;

  const unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank);

  const cycle = () => {
    setActive((prev) => {
      const next = (prev + 1) % layers.length;
      const nextLayer = layers[next];
      if (nextLayer) onLayerChange?.(next, nextLayer);
      return next;
    });
  };

  return (
    <div
      className={cn(
        "flex h-[100dvh] w-full flex-col bg-[color:var(--color-background)]",
        className,
      )}
    >
      <ControlPanelHeaderBar rank={layer.rank} locked={!unlocked}>
        {header}
      </ControlPanelHeaderBar>

      <div className="relative flex-1 overflow-hidden">
        <div
          key={active}
          className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-[color:var(--color-border)] animate-[cp-layer-in_200ms_ease-out]"
        >
          <QuadrantTile
            corner="tl"
            quadrant={layer.topLeft}
            locked={!unlocked}
            onSelect={() => onQuadrantSelect?.(layer.topLeft, "tl", layer)}
          />
          <QuadrantTile
            corner="tr"
            quadrant={layer.topRight}
            locked={!unlocked}
            onSelect={() => onQuadrantSelect?.(layer.topRight, "tr", layer)}
          />
          <QuadrantTile
            corner="bl"
            quadrant={layer.bottomLeft}
            locked={!unlocked}
            onSelect={() => onQuadrantSelect?.(layer.bottomLeft, "bl", layer)}
          />
          <QuadrantTile
            corner="br"
            quadrant={layer.bottomRight}
            locked={!unlocked}
            onSelect={() => onQuadrantSelect?.(layer.bottomRight, "br", layer)}
          />
        </div>

        {/* Centre control — 30% of the panel width, cycles to the next layer. */}
        <button
          type="button"
          onClick={cycle}
          aria-label={`Currently viewing the ${RANK_LABEL[layer.rank]} layer. Tap to switch layer.`}
          className="absolute left-1/2 top-1/2 z-20 flex aspect-square w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-full bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-xl ring-8 ring-[color:var(--color-background)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-[color:var(--color-primary)]"
        >
          {unlocked ? (
            <RefreshCw className="h-4 w-4 opacity-90" aria-hidden />
          ) : (
            <Lock className="h-4 w-4 opacity-90" aria-hidden />
          )}
          <span className="px-3 text-center text-sm font-semibold leading-tight">
            {RANK_LABEL[layer.rank]}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
            Tap to switch
          </span>
          <LayerDots count={layers.length} active={active} />
        </button>
      </div>
    </div>
  );
}

function ControlPanelHeaderBar({
  rank,
  locked,
  children,
}: {
  rank: ControlPanelRank;
  locked: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{RANK_LABEL[rank]}</span>
        {locked && (
          <span className="flex items-center gap-1 rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-xs text-[color:var(--color-muted-foreground)]">
            <Lock className="h-3 w-3" aria-hidden />
            View only
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </header>
  );
}

function LayerDots({ count, active }: { count: number; active: number }) {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-[color:var(--color-primary-foreground)] transition-opacity",
            i === active ? "opacity-100" : "opacity-40",
          )}
        />
      ))}
    </span>
  );
}

const CORNER_ALIGN: Record<ControlPanelCorner, string> = {
  tl: "items-start justify-start text-left",
  tr: "items-end justify-start text-right",
  bl: "items-start justify-end text-left",
  br: "items-end justify-end text-right",
};

function QuadrantTile({
  corner,
  quadrant,
  locked,
  onSelect,
}: {
  corner: ControlPanelCorner;
  quadrant: ControlPanelQuadrant;
  locked: boolean;
  onSelect: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[color:var(--color-muted-foreground)]">
        {quadrant.icon}
        {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="text-base font-semibold leading-tight">
        {quadrant.label}
      </span>
      {quadrant.hint && (
        <span className="text-xs text-[color:var(--color-muted-foreground)]">
          {quadrant.hint}
        </span>
      )}
    </>
  );

  const base = cn(
    "flex flex-col gap-1.5 bg-[color:var(--color-background)] p-6",
    CORNER_ALIGN[corner],
  );

  if (locked) {
    return (
      <div className={cn(base, "opacity-45")} aria-disabled="true">
        {body}
      </div>
    );
  }

  if (quadrant.href) {
    return (
      <a
        href={quadrant.href}
        onClick={onSelect}
        className={cn(base, "transition-colors hover:bg-[color:var(--color-muted)]")}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(base, "transition-colors hover:bg-[color:var(--color-muted)]")}
    >
      {body}
    </button>
  );
}

export interface ControlPanelHeaderProps {
  /** Display name of the signed-in member. Omit to show a "Sign in" prompt. */
  userName?: string;
  onAuth?: () => void;
  onSettings?: () => void;
}

/**
 * Default header content for the control panel — login state plus a settings
 * control. Pass into `ControlPanel`'s `header` slot, or supply your own node.
 */
export function ControlPanelHeader({
  userName,
  onAuth,
  onSettings,
}: ControlPanelHeaderProps) {
  return (
    <>
      <button
        type="button"
        onClick={onAuth}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-[color:var(--color-muted)]"
      >
        <UserRound className="h-4 w-4" aria-hidden />
        {userName ?? "Sign in"}
      </button>
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="rounded-md p-1.5 transition-colors hover:bg-[color:var(--color-muted)]"
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}
