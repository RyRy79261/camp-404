import * as React from "react"

import { cn } from "../lib/utils"

// Loading placeholders for the `force-dynamic` pages — a `loading.tsx` body that
// holds the page's shape while the server work runs.
//
// Two layers. `Skeleton`, `SkeletonText` and `SkeletonAvatar` are bare
// decorative bars: `aria-hidden`, so a screen reader hears nothing from them.
// The composed pieces below each wrap themselves in a `SkeletonRegion`, which
// contributes the single `.sr-only` label that announces the wait — exactly one
// per region, never nested, so the composed pieces build from the primitives
// rather than from each other.
//
// The pulse is `motion-safe:` throughout: a full-page bank of pulsing bars is
// precisely the animation a `prefers-reduced-motion` reader opted out of.

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

// One decorative bar. `className` is merged verbatim, so callers size it.
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "motion-safe:animate-pulse rounded-md bg-muted-foreground/15",
        className,
      )}
      {...props}
    />
  )
}

export interface SkeletonRegionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Screen-reader label announced while the region loads. */
  label?: string
}

// The announcing wrapper. Everything a reader learns about the wait comes from
// here; nest one per loading region, not per bar.
function SkeletonRegion({
  label = "Loading…",
  className,
  children,
  ...props
}: SkeletonRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export interface SkeletonTextProps extends SkeletonProps {
  /** Number of lines to draw. */
  lines?: number
}

// A paragraph of text lines; the last runs short so the block reads as prose.
function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 && lines > 1 && "w-2/3")}
        />
      ))}
    </div>
  )
}

export interface SkeletonAvatarProps extends SkeletonProps {
  /** Diameter in px, matching the avatar it stands in for. */
  px?: number
}

function SkeletonAvatar({ px = 40, className, ...props }: SkeletonAvatarProps) {
  return (
    <Skeleton
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: px, height: px }}
      {...props}
    />
  )
}

export interface SkeletonCardProps extends SkeletonRegionProps {
  lines?: number
}

// A card-shaped placeholder — title bar plus body lines, on the card surface.
function SkeletonCard({
  lines = 2,
  label = "Loading card…",
  className,
  ...props
}: SkeletonCardProps) {
  return (
    <SkeletonRegion
      label={label}
      className={cn("rounded-xl border bg-card p-6", className)}
      {...props}
    >
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={lines} className="mt-4" />
    </SkeletonRegion>
  )
}

export interface SkeletonListProps extends SkeletonRegionProps {
  rows?: number
  /** Draw a leading avatar circle on each row (roster/member lists). */
  avatar?: boolean
}

function SkeletonList({
  rows = 5,
  avatar = true,
  label = "Loading list…",
  className,
  ...props
}: SkeletonListProps) {
  return (
    <SkeletonRegion
      label={label}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <SkeletonAvatar px={30} />}
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

export interface SkeletonTableProps extends SkeletonRegionProps {
  rows?: number
  columns?: number
}

// Stands in for a data table: a header strip over evenly-weighted cell bars.
function SkeletonTable({
  rows = 6,
  columns = 4,
  label = "Loading table…",
  className,
  ...props
}: SkeletonTableProps) {
  return (
    <SkeletonRegion
      label={label}
      className={cn("overflow-hidden rounded-lg border bg-card", className)}
      {...props}
    >
      <div className="flex gap-4 border-b bg-black/20 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  )
}

export interface SkeletonFormProps extends SkeletonRegionProps {
  /** Number of label + field pairs. */
  fields?: number
}

function SkeletonForm({
  fields = 4,
  label = "Loading form…",
  className,
  ...props
}: SkeletonFormProps) {
  return (
    <SkeletonRegion
      label={label}
      className={cn("flex flex-col gap-5", className)}
      {...props}
    >
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

export interface SkeletonPageProps extends SkeletonRegionProps {
  /** Draw the page title + subtitle block above the body. */
  header?: boolean
  rows?: number
}

// A whole-page body for `loading.tsx`. Built from the primitives, not from the
// composed regions, so the page announces itself once.
function SkeletonPage({
  header = true,
  rows = 4,
  label = "Loading page…",
  className,
  ...props
}: SkeletonPageProps) {
  return (
    <SkeletonRegion
      label={label}
      className={cn("flex flex-col gap-6 p-4", className)}
      {...props}
    >
      {header && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </SkeletonRegion>
  )
}

export {
  Skeleton,
  SkeletonRegion,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonList,
  SkeletonTable,
  SkeletonForm,
  SkeletonPage,
}
