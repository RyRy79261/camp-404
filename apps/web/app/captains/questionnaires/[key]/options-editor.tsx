"use client";

import { Plus, Trash2 } from "lucide-react";
import { slugify } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";

export interface EditableOption {
  value: string;
  label: string;
}

// Editor for a choice field's options. Labels are editable; the `value` (the
// stable join key into stored answers) is auto-slugged once at creation and
// stays fixed. A choice field needs at least two options.
export function OptionsEditor({
  options,
  onChange,
}: {
  options: EditableOption[];
  onChange: (next: EditableOption[]) => void;
}) {
  function setLabel(index: number, label: string) {
    onChange(options.map((o, i) => (i === index ? { ...o, label } : o)));
  }

  function add() {
    const taken = new Set(options.map((o) => o.value));
    const base = slugify(`option ${options.length + 1}`) || "option";
    let value = base;
    let n = options.length + 1;
    while (taken.has(value)) {
      n += 1;
      value = `${base}-${n}`;
    }
    onChange([...options, { value, label: `Option ${options.length + 1}` }]);
  }

  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((option, index) => (
        <div key={option.value} className="flex items-center gap-2">
          <Input
            value={option.label}
            onChange={(e) => setLabel(index, e.currentTarget.value)}
            placeholder="Option label"
            aria-label={`Option ${index + 1} label`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove option ${index + 1}`}
            disabled={options.length <= 2}
            onClick={() => remove(index)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start border-dashed"
        onClick={add}
      >
        <Plus /> Add option
      </Button>
      {options.length < 2 && (
        <p className="text-xs text-destructive">Add at least 2 options.</p>
      )}
    </div>
  );
}
