"use client";

import * as React from "react";
import { Lock, Mic, Settings, UserRound } from "lucide-react";
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

/** Shorter labels for the bottom tab bar — "Camp Member" doesn't fit. */
const RANK_TAB_LABEL: Record<ControlPanelRank, string> = {
  camp_member: "Me",
  team_lead: "Team Lead",
  captain: "Captain",
};

export function rankLevel(rank: ControlPanelRank): number {
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
  /** Numeric badge pinned to the tile's outer corner. Falsy values hide it. */
  badge?: number | string;
}

export interface ControlPanelLayer {
  /** Minimum rank required to interact with this layer's quadrants. */
  rank: ControlPanelRank;
  topLeft: ControlPanelQuadrant;
  topRight: ControlPanelQuadrant;
  bottomLeft: ControlPanelQuadrant;
  bottomRight: ControlPanelQuadrant;
}

export interface ControlPanelCentre {
  /** Visible label inside the circle. Default: `TALK`. */
  label?: string;
  /** Icon shown above the label. Default: microphone. */
  icon?: React.ReactNode;
  /** ARIA label override; falls back to the visible label. */
  ariaLabel?: string;
  onPress?: () => void;
  onRelease?: () => void;
}

export interface ControlPanelProps {
  /** Ordered low → high rank. Typically three: member, team lead, captain. */
  layers: ControlPanelLayer[];
  /** The viewing camp member's rank — decides which layers are unlocked. */
  viewerRank?: ControlPanelRank;
  /** Layer shown first. Defaults to 0 (personal context). */
  initialLayer?: number;
  /** Brand label in the top-left of the header. Defaults to `Camp 404`. */
  title?: string;
  /** Right-hand header slot — notifications, avatar, settings. */
  header?: React.ReactNode;
  /** Push-to-talk centre button. Omit to hide the button entirely. */
  centre?: ControlPanelCentre;
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
 * with a circular push-to-talk centre button; the bottom tab bar switches
 * between layers (member → team lead → captain). Layers above the viewer's
 * rank stay browsable but locked — the UI is visible, the tiles are not.
 */
export function ControlPanel({
  layers,
  viewerRank = "camp_member",
  initialLayer = 0,
  title = "Camp 404",
  header,
  centre,
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

  const selectLayer = (index: number) => {
    setActive(index);
    const next = layers[index];
    if (next) onLayerChange?.(index, next);
  };

  return (
    <div
      className={cn(
        "flex h-[100dvh] w-full flex-col bg-[color:var(--color-background)]",
        className,
      )}
    >
      <ControlPanelHeaderBar title={title}>{header}</ControlPanelHeaderBar>

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

        {centre && <CentreButton centre={centre} />}
      </div>

      <LayerTabBar
        layers={layers}
        active={active}
        viewerRank={viewerRank}
        onSelect={selectLayer}
      />
    </div>
  );
}

function ControlPanelHeaderBar({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-4">
      <span className="text-base font-semibold tracking-tight">{title}</span>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

function CentreButton({ centre }: { centre: ControlPanelCentre }) {
  const label = centre.label ?? "TALK";
  const icon = centre.icon ?? <Mic className="h-5 w-5" aria-hidden />;
  return (
    <button
      type="button"
      aria-label={centre.ariaLabel ?? label}
      onPointerDown={centre.onPress}
      onPointerUp={centre.onRelease}
      onPointerLeave={centre.onRelease}
      onPointerCancel={centre.onRelease}
      className="absolute left-1/2 top-1/2 z-20 flex aspect-square w-[22%] min-w-[5rem] max-w-[7rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-xl ring-4 ring-[color:var(--color-background)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-[color:var(--color-primary)]"
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">
        {label}
      </span>
    </button>
  );
}

function LayerTabBar({
  layers,
  active,
  viewerRank,
  onSelect,
}: {
  layers: ControlPanelLayer[];
  active: number;
  viewerRank: ControlPanelRank;
  onSelect: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Switch rank view"
      className="flex h-14 shrink-0 items-stretch border-t border-[color:var(--color-border)]"
    >
      {layers.map((layer, index) => {
        const isActive = index === active;
        const isLocked = rankLevel(viewerRank) < rankLevel(layer.rank);
        return (
          <button
            key={layer.rank}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={isActive}
            aria-label={
              isLocked
                ? `${RANK_LABEL[layer.rank]} view (locked, view only)`
                : `${RANK_LABEL[layer.rank]} view`
            }
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 text-sm transition-colors",
              isActive
                ? "font-semibold text-[color:var(--color-primary)]"
                : "text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            <span className="flex items-center gap-1.5">
              {RANK_TAB_LABEL[layer.rank]}
              {isLocked && <Lock className="h-3 w-3" aria-hidden />}
            </span>
            {isActive && (
              <span
                aria-hidden
                className="absolute bottom-2 h-0.5 w-6 rounded-full bg-[color:var(--color-primary)]"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

const CORNER_ALIGN: Record<ControlPanelCorner, string> = {
  tl: "items-start justify-start text-left",
  tr: "items-end justify-start text-right",
  bl: "items-start justify-end text-left",
  br: "items-end justify-end text-right",
};

// Badges always sit at the top edge of each tile so they don't collide
// with the corner-aligned title/hint stack in the bottom row.
const BADGE_CORNER: Record<ControlPanelCorner, string> = {
  tl: "top-3 left-3",
  tr: "top-3 right-3",
  bl: "top-3 left-3",
  br: "top-3 right-3",
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

  const badge =
    quadrant.badge != null && quadrant.badge !== "" && quadrant.badge !== 0 ? (
      <span
        aria-hidden
        className={cn(
          "absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--color-primary)] px-1.5 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]",
          BADGE_CORNER[corner],
        )}
      >
        {quadrant.badge}
      </span>
    ) : null;

  const base = cn(
    "relative flex flex-col gap-1.5 bg-[color:var(--color-background)] p-6",
    CORNER_ALIGN[corner],
  );

  if (locked) {
    return (
      <div className={cn(base, "opacity-45")} aria-disabled="true">
        {body}
        {badge}
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
        {badge}
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
      {badge}
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
