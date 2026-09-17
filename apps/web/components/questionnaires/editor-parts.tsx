"use client";

import * as React from "react";
import { Switch } from "@camp404/ui/components/switch";
import { cn } from "@camp404/ui/lib/utils";

// The two small layout parts every builder editor uses (AB's block editor
// defines them inline; the section and show-when editors need them too).

export function Labelled({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const hintId = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint ? (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
      />
    </div>
  );
}

/** A number box's value, or undefined when it is empty or not a number. */
export function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
