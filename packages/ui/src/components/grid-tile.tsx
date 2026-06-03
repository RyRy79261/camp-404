import * as React from "react"

import { cn } from "../lib/utils"

// A square cell for tile grids (quadrant nav, tool grids) — centred content in a
// 1:1 bordered card. Presentational; wrap in a link/button at the call site.
export type GridTileProps = React.HTMLAttributes<HTMLDivElement>

function GridTile({ className, ...props }: GridTileProps) {
  return (
    <div
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border bg-card/40 p-4 text-center",
        className,
      )}
      {...props}
    />
  )
}

export { GridTile }
