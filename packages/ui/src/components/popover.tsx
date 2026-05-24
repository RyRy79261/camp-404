"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        // max-h uses BOTH Radix's available-height (correct on desktop
        // and iOS) AND a hard 60dvh cap (defensive — Android Chrome's
        // window.innerHeight doesn't shrink when the soft keyboard
        // opens, so Radix's calculation is too generous and the
        // popover ends up under the keyboard otherwise).
        "z-50 flex max-h-[min(var(--radix-popover-content-available-height),60dvh)] w-72 flex-col overflow-hidden rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-[color:var(--color-card-foreground)] shadow-md outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
