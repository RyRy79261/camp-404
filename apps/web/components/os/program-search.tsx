"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trapTab } from "@camp404/os";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@camp404/ui/components/command";
import { matchProgram } from "@/lib/program-routes";
import {
  filterPrograms,
  isSearchShortcut,
  pushRecent,
  readRecent,
  recentPrograms,
  searchablePrograms,
  splitMatch,
  writeRecent,
  type SearchHit,
  type SearchProgram,
} from "@/lib/program-search";
import type { ClientProgram, ProgramManifest } from "@/lib/programs";
import { programIcon } from "./program-icons";

// Ctrl+K search (issue #326, step 1; the owner's pick, Option A of
// camp404-night/design/ctrl-k.html): "a search module like Notion, ctrl + k.
// I first want programs searchable so it's quick."
//
// Ctrl+K (Cmd+K on a Mac) anywhere on the desktop opens a box near the top
// over a dimmed desktop, a program's window in focus or not; inside a
// rich-text editor the key stays the editor's. The empty box lists the
// programs opened last; typing filters the programs the member may open (the
// manifest's, filtered on the server by rank), and Enter opens one the way the
// Start menu does. On a phone the bottom bar's Search opens it full screen.
//
// The OS's own modal, like the folder-name dialog: drawn inside the desktop
// (so a phone's sheet stops at the bottom bar), focus held inside, Esc closes
// and gives focus back to where it was. Nothing runs while it is shut but
// one keydown listener; nothing asks the server.

/** How many matches the box shows at most. */
const MAX_HITS = 8;

const KBD =
  "inline-grid min-w-5 place-items-center border border-border px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-muted-foreground";

export interface ProgramSearchProps {
  manifest: ProgramManifest;
  /** The signed-in member's camp id: whose Recent list this browser keeps. */
  userId: string;
  /** The live window's key, so opening a program by any way counts as recent. */
  liveKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open a program the Start menu's way (the desktop's own navigation). */
  onOpenProgram: (program: ClientProgram) => void;
  /** Below md: the full-screen sheet above the bottom bar, with Cancel. */
  phone?: boolean;
}

export function ProgramSearch({
  manifest,
  userId,
  liveKey,
  open,
  onOpenChange,
  onOpenProgram,
  phone = false,
}: ProgramSearchProps) {
  const list = useMemo(() => searchablePrograms(manifest), [manifest]);
  const [recent, setRecent] = useState<string[]>([]);

  // Read Recent once the page is in the browser (the server has no storage).
  useEffect(() => {
    setRecent(readRecent(storage(), userId));
  }, [userId]);

  // A program's window coming to the front counts as opened, however it was
  // opened (an icon, the Start menu, a link, search).
  useEffect(() => {
    if (!liveKey) return;
    const entry = list.find(
      (e) => matchProgram(e.program.href)?.instanceKey === liveKey,
    );
    if (!entry) return;
    setRecent((now) => {
      if (now[0] === entry.program.id) return now;
      const next = pushRecent(now, entry.program.id);
      writeRecent(storage(), userId, next);
      return next;
    });
  }, [liveKey, list, userId]);

  // Ctrl+K / Cmd+K opens it, and shuts it again.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      onOpenChange(!openRef.current);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  if (!open) return null;
  return (
    <SearchBox
      list={list}
      recent={recentPrograms(list, recent)}
      phone={phone}
      onClose={() => onOpenChange(false)}
      onPick={(program) => {
        onOpenChange(false);
        onOpenProgram(program);
      }}
    />
  );
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Cmd on a Mac, Ctrl elsewhere; decided in the browser. */
function useModKey(): string {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      setMod("⌘");
    }
  }, []);
  return mod;
}

/** The taskbar's quiet hint, a button too: "Ctrl K · Search". */
export function SearchHint({ onOpen }: { onOpen: () => void }) {
  const mod = useModKey();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search programs"
      aria-keyshortcuts="Control+K Meta+K"
      data-os-search-hint
      className="flex h-8 shrink-0 items-center whitespace-nowrap px-2 font-pixel text-[10px] uppercase tracking-[0.12em] text-os-fg/85 outline-none hover:text-os-fg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-fg max-lg:hidden"
    >
      {mod} K · Search
    </button>
  );
}

function SearchBox({
  list,
  recent,
  phone,
  onClose,
  onPick,
}: {
  list: readonly SearchProgram[];
  recent: readonly SearchProgram[];
  phone: boolean;
  onClose: () => void;
  onPick: (program: ClientProgram) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const picked = useRef(false);

  // Focus the field; on the way out (Esc, Cancel, a click outside), focus
  // goes back to where it was. Not after a pick: the program's window takes
  // it.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    input.current?.focus({ preventScroll: true });
    return () => {
      if (!picked.current && before?.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  const typed = query.trim();
  const hits: SearchHit[] = typed
    ? filterPrograms(list, typed).slice(0, MAX_HITS)
    : [];
  // With nothing typed: Recent, or every program while there is no Recent.
  const idle: SearchHit[] = (recent.length > 0 ? recent : list).map((e) => ({
    ...e,
    match: null,
  }));
  const rows = typed ? hits : idle;
  const heading = typed
    ? "Programs"
    : recent.length > 0
      ? "Recent"
      : "Programs";
  const said = typed
    ? hits.length === 0
      ? "No programs found."
      : `${hits.length} ${hits.length === 1 ? "program" : "programs"} found.`
    : "";

  const pick = (program: ClientProgram) => {
    picked.current = true;
    onPick(program);
  };

  return (
    <div
      data-os-search
      className={
        phone
          ? "fixed inset-x-0 top-0 bottom-[var(--os-phone-bar,0px)] z-[85] md:hidden"
          : "fixed inset-0 z-[105] bg-os-bg/60 max-md:hidden"
      }
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
            onClose();
          }
          trapTab(e, box.current);
        }}
        className={`os-window-colours flex flex-col bg-popover text-popover-foreground ${
          phone
            ? "h-full border-t border-os-primary"
            : "absolute left-1/2 top-[12vh] w-[35rem] max-w-[calc(100%-2rem)] -translate-x-1/2 border border-os-primary shadow-[0_0_30px_color-mix(in_oklab,var(--os-primary)_40%,transparent),0_20px_50px_rgb(0_0_0/0.6)]"
        }`}
      >
        <h2 id={`${id}-title`} className="sr-only">
          Search programs
        </h2>
        <Command
          shouldFilter={false}
          // cmdk's Ctrl+J/K/N/P would take Ctrl+K inside the box; here it
          // shuts the box, as it opened it.
          vimBindings={false}
          loop
          label="Search programs"
          className="h-auto min-h-0 flex-1 rounded-none bg-transparent text-inherit [&_[cmdk-input-wrapper]]:border-border [&_[cmdk-input-wrapper]]:px-4"
        >
          <div
            className={
              phone
                ? "flex items-center gap-3 border-b border-border p-3 [&_[cmdk-input-wrapper]]:flex-1 [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:border-os-primary [&_[cmdk-input-wrapper]]:bg-background [&_[cmdk-input-wrapper]]:px-3"
                : "relative"
            }
          >
            <CommandInput
              ref={input}
              value={query}
              onValueChange={setQuery}
              placeholder="Search programs…"
              aria-label="Search programs"
              className={
                phone
                  ? "h-10 py-0 text-base"
                  : "h-14 pr-14 text-[17px] font-medium"
              }
            />
            {phone ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 shrink-0 items-center border border-border px-3 text-xs font-semibold text-foreground hover:border-os-primary"
              >
                Cancel
              </button>
            ) : (
              <span
                aria-hidden
                className={`${KBD} absolute right-4 top-1/2 -translate-y-1/2`}
              >
                Esc
              </span>
            )}
          </div>
          <CommandList
            className={
              phone
                ? "max-h-none min-h-0 flex-1 overscroll-contain"
                : "max-h-[min(24rem,60vh)]"
            }
          >
            {typed && hits.length === 0 ? (
              <CommandEmpty className="px-4 py-5 text-left text-sm text-muted-foreground">
                No program called “{typed}”. Search finds programs for now;
                pages and entries come later.
              </CommandEmpty>
            ) : (
              <CommandGroup
                heading={heading}
                className="p-0 text-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.15em]"
              >
                {rows.map((hit) => (
                  <Row
                    key={hit.program.id}
                    hit={hit}
                    phone={phone}
                    onPick={pick}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {!phone && (
            <div className="flex items-center gap-3.5 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className={KBD} aria-label="Up">
                  ↑
                </kbd>
                <kbd className={KBD} aria-label="Down">
                  ↓
                </kbd>{" "}
                move
              </span>
              <span className="flex items-center gap-1">
                <kbd className={KBD}>Enter</kbd> open
              </span>
              <span className="flex items-center gap-1">
                <kbd className={KBD}>Esc</kbd> close
              </span>
              <span className="ml-auto">Programs only for now</span>
            </div>
          )}
        </Command>
        <p role="status" className="sr-only">
          {said}
        </p>
      </div>
    </div>
  );
}

function Row({
  hit,
  phone,
  onPick,
}: {
  hit: SearchHit;
  phone: boolean;
  onPick: (program: ClientProgram) => void;
}) {
  const { program, where, match } = hit;
  const { before, matched, after } = splitMatch(program.label, match);
  return (
    <CommandItem
      value={program.id}
      aria-label={`${program.label}, ${where}`}
      onSelect={() => onPick(program)}
      data-search-row={program.id}
      className={`gap-3 rounded-none px-4 text-sm data-[selected='true']:bg-[var(--color-pick)] data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_3px_0_0_0_var(--color-primary)] ${
        phone ? "min-h-12 border-b border-border py-2.5" : "py-2"
      }`}
    >
      <span
        aria-hidden
        className="grid size-[26px] shrink-0 place-items-center border border-[color-mix(in_oklab,var(--os-accent)_60%,transparent)] text-os-accent"
      >
        {programIcon(program)("size-4")}
      </span>
      <span className="min-w-0 truncate">
        {before}
        {matched && (
          <mark className="bg-transparent font-bold text-primary">
            {matched}
          </mark>
        )}
        {after}
      </span>
      <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">
        {where}
      </span>
    </CommandItem>
  );
}
