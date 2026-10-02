import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";

// A native <select> in the kit's look (the roster toolbar's), for the
// inventory's forms and filters. Native on purpose: it works in a plain GET
// form on the server page, and on a phone it opens the system picker.

const SELECT =
  "h-10 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export interface SelectOption {
  value: string;
  label: string;
}

export function NativeSelect({
  options,
  className,
  placeholder,
  selectClassName,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly SelectOption[];
  /** A first, empty choice ("All teams", "None"). */
  placeholder?: string;
  /** Classes for the <select> itself (a filter strip's shorter box). */
  selectClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(SELECT, selectClassName)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
      />
    </div>
  );
}
