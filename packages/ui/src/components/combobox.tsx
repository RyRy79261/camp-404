"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ReadonlyArray<ComboboxOption>;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Searchable single-select dropdown. Popover-anchored cmdk list with a
 * filterable input — the right primitive for long lookup sets like a
 * country picker where a plain Select would force the user to scroll
 * through hundreds of options.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "Nothing found.",
  id,
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? options.find((o) => o.value === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-[color:var(--color-muted-foreground)]",
            className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const selected = value === o.value;
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {/* Fixed-width slot for the check — always rendered
                      * so item text doesn't shift when the selection
                      * changes. Conditional render (vs opacity toggling)
                      * dodges a Tailwind class-scanner pitfall where
                      * opacity-0 in a shared package didn't make it into
                      * the consuming app's bundle. */}
                    <span className="mr-2 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
