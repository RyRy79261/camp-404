"use client";

import { useEffect, useId, useRef, useState } from "react";
import { trapTab } from "./focus";
import { OS_BUTTON_PRIMARY, OS_BUTTON_SECONDARY } from "./buttons";
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
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-os-bg/70 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
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
        className="os-window-in flex w-[26rem] max-w-full select-text flex-col border border-os-primary bg-os-panel shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
      >
        <div className="flex h-8 select-none items-center justify-between border-b border-os-primary bg-os-primary pl-3 pr-1 text-os-primary-fg">
          <span className="font-pixel text-xs uppercase tracking-[0.2em]">
            Folder
          </span>
          {/* The pointer's way out; the keyboard's is Esc or Cancel, so it
              stays out of the Tab cycle. */}
          <button
            type="button"
            tabIndex={-1}
            onClick={onCancel}
            aria-label="Close"
            className="grid size-7 place-items-center text-lg leading-none hover:bg-os-bg/20"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex gap-3 p-4">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center border border-os-accent bg-os-accent/15 font-pixel text-sm text-os-fg"
            >
              i
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <h2
                id={`${id}-title`}
                className="text-base font-semibold leading-snug text-os-fg"
              >
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
                className="h-9 w-full border border-os-muted/60 bg-os-bg px-2.5 text-sm text-os-fg outline-none placeholder:text-os-muted/70 hover:border-os-muted focus-visible:border-os-primary"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-os-line bg-os-bg/40 px-4 py-3">
            <button
              type="button"
              onClick={onCancel}
              className={OS_BUTTON_SECONDARY}
            >
              Cancel
            </button>
            <button type="submit" className={OS_BUTTON_PRIMARY}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
