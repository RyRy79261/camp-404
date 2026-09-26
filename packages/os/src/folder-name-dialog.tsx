"use client";

import { useEffect, useId, useRef, useState } from "react";
import { trapTab } from "./focus";
import { LAYOUT_LIMITS, NEW_FOLDER_NAME, cleanFolderName } from "./icon-grid";

// Naming a folder (visual-language doc 4.4a): a small dialog with one field,
// 24 characters at most, and Save. A new folder asks at once, with the field
// empty and "New folder" as the hint; a rename starts from the old name, all
// of it selected. Esc or Cancel keeps the name it had.

type Props = {
  open: boolean;
  /** A folder just made ("Name your new folder"), or a rename. */
  fresh: boolean;
  /** The folder's name now. */
  name: string;
  /** The cleaned name: one line, trimmed, 24 at most, never empty. */
  onSave: (name: string) => void;
  onCancel: () => void;
};

export function FolderNameDialog(props: Props) {
  if (!props.open) return null;
  return <NameForm {...props} />;
}

function NameForm({ fresh, name, onSave, onCancel }: Props) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(fresh ? "" : name);

  // Focus the field; a rename has the old name selected, ready to type over.
  // Focus goes back to where it was when the dialog shuts.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    field.current?.focus();
    field.current?.select();
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  const heading = fresh ? "Name your new folder" : "Rename this folder";
  const save = () => onSave(cleanFolderName(value, name || NEW_FOLDER_NAME));

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-os-bg/60 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
          trapTab(e, box.current);
        }}
        className="w-full max-w-sm select-text border border-os-primary bg-os-panel shadow-[6px_6px_0_0_rgb(0_0_0/0.45)]"
      >
        <div className="flex h-9 items-center bg-os-primary px-3 font-pixel text-xs uppercase tracking-[0.2em] text-os-primary-fg">
          Folder
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 id={`${id}-title`} className="text-sm font-semibold text-os-fg">
            {heading}
          </h2>
          <label htmlFor={`${id}-name`} className="sr-only">
            Folder name
          </label>
          <input
            ref={field}
            id={`${id}-name`}
            value={value}
            maxLength={LAYOUT_LIMITS.folderName}
            placeholder={NEW_FOLDER_NAME}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
            className="w-full border border-os-line bg-os-bg px-2 py-1.5 text-sm text-os-fg outline-none focus-visible:border-os-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="border border-os-line px-3 py-1.5 text-sm text-os-fg hover:border-os-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="border border-os-primary bg-os-primary px-3 py-1.5 text-sm font-semibold text-os-primary-fg"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
