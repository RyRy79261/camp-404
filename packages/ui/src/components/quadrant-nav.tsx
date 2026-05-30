"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface QuadrantNavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface QuadrantNavProps {
  topLeft: QuadrantNavItem;
  topRight: QuadrantNavItem;
  bottomLeft: QuadrantNavItem;
  bottomRight: QuadrantNavItem;
  /** Centre button — circular push-to-talk control (see the project brief). */
  centre: {
    label: string;
    onPress?: () => void;
    onRelease?: () => void;
  };
  className?: string;
}

/**
 * Camp 404's four-quadrant home navigation with circular centre button
 * (push-to-talk). Open question per the project brief — v0 layout, to be
 * validated in Figma.
 */
export function QuadrantNav({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  centre,
  className,
}: QuadrantNavProps) {
  return (
    <div
      className={cn(
        "relative grid h-[100dvh] w-full grid-cols-2 grid-rows-2 gap-px bg-[color:var(--color-border)]",
        className,
      )}
    >
      <QuadrantTile item={topLeft} corner="tl" />
      <QuadrantTile item={topRight} corner="tr" />
      <QuadrantTile item={bottomLeft} corner="bl" />
      <QuadrantTile item={bottomRight} corner="br" />

      <button
        type="button"
        aria-label={centre.label}
        onPointerDown={centre.onPress}
        onPointerUp={centre.onRelease}
        onPointerLeave={centre.onRelease}
        className="absolute left-1/2 top-1/2 z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-lg ring-4 ring-[color:var(--color-background)] focus-visible:outline-none focus-visible:ring-[color:var(--color-primary)]"
      >
        <span className="text-xs font-medium">{centre.label}</span>
      </button>
    </div>
  );
}

function QuadrantTile({
  item,
  corner,
}: {
  item: QuadrantNavItem;
  corner: "tl" | "tr" | "bl" | "br";
}) {
  const align = {
    tl: "items-end justify-end pb-12 pr-12 text-right",
    tr: "items-end justify-start pb-12 pl-12 text-left",
    bl: "items-start justify-end pt-12 pr-12 text-right",
    br: "items-start justify-start pt-12 pl-12 text-left",
  }[corner];

  return (
    <a
      href={item.href}
      className={cn(
        "flex flex-col gap-2 bg-[color:var(--color-background)] p-6 transition-colors hover:bg-[color:var(--color-muted)]",
        align,
      )}
    >
      {item.icon}
      <span className="text-base font-medium">{item.label}</span>
    </a>
  );
}
