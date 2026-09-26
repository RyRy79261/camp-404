"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RotateCcw } from "lucide-react";
import {
  useKeptDraft,
  useKeptDrafts,
  useWindowDirty,
  useWindowKey,
} from "@camp404/os";
import { Button } from "@camp404/ui/components/button";
import { draftStorageKey } from "./window-storage";

// Unsaved input in the four editors that write long text (design doc,
// sections 5 and 7): the meeting editor, the meal-plan editor, the recipe
// source editor and the announcements composer. Each one (the two Kitchen
// editors only the first: see `restore` below):
//
//  - registers useWindowDirty, so close, minimise, a switch, a launch and a
//    page unload ask first;
//  - hands the desktop its values, so a Back (which cannot be asked about)
//    keeps them in memory for that window;
//  - autosaves them to sessionStorage for this tab, under its own key per
//    member, window and editor, so a hard load does not lose them either;
//  - on reopening, starts from the draft with "Unsaved changes restored" and
//    a Discard button.
//
// The stored draft is cleared on save, on Discard, on "leave anyway", when its
// window is closed, on sign-out, and when another member signs in on the tab
// (window-storage.ts). What comes back is never trusted: each editor checks it
// with its own schema (`parse`), and anything else is thrown away.
//
// Outside the desktop (a unit test, the bare layout) there is no member and no
// window, so nothing is stored and nothing asks.

/** The signed-in member the desktop is drawn for: the drafts' owner. */
export const DraftOwnerContext = createContext<string | null>(null);

/** How long typing must pause before the draft is written. */
export const AUTOSAVE_AFTER_MS = 400;

/** What an editor says when it would lose unsaved input. */
export const UNSAVED_MESSAGE =
  "You have unsaved changes. Leave without saving? They will be lost.";

/**
 * JSON with every object's keys sorted, so two equal values always give the
 * same string, whatever order their keys were written in (a schema's parse
 * reorders them).
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      );
    }
    return v;
  });
}

function readStored(key: string): unknown {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeStored(key: string, json: string) {
  try {
    window.sessionStorage.setItem(key, json);
  } catch {
    // Not kept (a private window, a full store); the guard still asks.
  }
}

function removeStored(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

export interface EditorDraft<T> {
  /** The values the form starts from: a restored draft, or the saved ones. */
  start: T;
  /** Changes when the form must start again (a restore, a Discard): its key. */
  generation: number;
  /** The form started from a draft the member had not saved. */
  restored: boolean;
  /** Throw the draft away and start again from the saved values. */
  discard: () => void;
  /**
   * @internal Whether these values (stableJson) are saved: the page's own
   * saved values, or what the form last saved before the page caught up.
   */
  isSaved: (json: string) => boolean;
  /** @internal Where the draft is stored, or null outside the desktop. */
  storageKey: string | null;
  /** @internal The form saved these values (stableJson). */
  markSaved: (json: string) => void;
}

/**
 * The start of an editor that keeps drafts. Call it in a wrapper, and key the
 * form by `generation`, so a restore or a Discard starts the form again.
 *
 * `baseline` is what is saved now (the page's props), `parse` checks a draft
 * read back (from memory or sessionStorage) and returns it, or null to throw
 * it away. A draft equal to the saved values is not a restore.
 */
export function useEditorDraft<T>({
  editor,
  baseline,
  parse,
  restore = true,
}: {
  editor: string;
  baseline: T;
  parse: (raw: unknown) => T | null;
  /**
   * False: only the guard. Unsaved input still asks before its window goes,
   * but nothing is kept or brought back, so the page looks exactly as it did
   * (the Kitchen editors: PR C changes nothing inside a Kitchen page, and a
   * restored draft needs its "restored" note and Discard, which the owner
   * has not seen; plan section 0).
   */
  restore?: boolean;
}): EditorDraft<T> {
  const owner = useContext(DraftOwnerContext);
  const windowKey = useWindowKey();
  const storageKey =
    restore && owner && windowKey
      ? draftStorageKey(owner, windowKey, editor)
      : null;
  const baselineJson = stableJson(baseline);

  // A draft kept in memory across a Back. Only there after a soft
  // navigation, so reading it while rendering never splits the server's
  // paint from the browser's.
  const kept = useKeptDraft();
  const drafts = useKeptDrafts();
  const [state, setState] = useState<{
    start: T;
    generation: number;
    restored: boolean;
  }>(() => {
    const draft = kept === undefined || !restore ? null : parse(kept);
    return draft && stableJson(draft) !== baselineJson
      ? { start: draft, generation: 0, restored: true }
      : { start: baseline, generation: 0, restored: false };
  });
  // What the form last saved, until the page's own props say so too.
  const [savedOverride, setSavedOverride] = useState<string | null>(null);

  const latest = useRef({ baseline, baselineJson, parse });
  useEffect(() => {
    latest.current = { baseline, baselineJson, parse };
  });

  // Once mounted (the server rendered the saved values, and the browser must
  // hydrate the same), a draft kept in this tab's storage, if there is one
  // and memory had none. A layout effect, so the form starts again from it
  // before anything is painted, and before the form's own effects run.
  const checkedStorage = useRef(false);
  useLayoutEffect(() => {
    if (checkedStorage.current || !storageKey) return;
    checkedStorage.current = true;
    if (state.restored) return;
    const raw = readStored(storageKey);
    if (raw === undefined) return;
    const draft = latest.current.parse(raw);
    if (!draft || stableJson(draft) === latest.current.baselineJson) {
      removeStored(storageKey);
      return;
    }
    // A restore is an event (the form starts again from the draft), not
    // state derived from props.
    setState((s) => ({
      start: draft,
      generation: s.generation + 1,
      restored: true,
    }));
  }, [state.restored, storageKey]);

  const discard = useCallback(() => {
    // Thrown away on purpose: the form that goes keeps nothing, in memory
    // or in storage.
    if (windowKey) drafts.release(windowKey);
    if (storageKey) removeStored(storageKey);
    setSavedOverride(null);
    setState((s) => ({
      start: latest.current.baseline,
      generation: s.generation + 1,
      restored: false,
    }));
  }, [drafts, storageKey, windowKey]);

  const markSaved = useCallback((json: string) => {
    setSavedOverride(json);
    setState((s) => (s.restored ? { ...s, restored: false } : s));
  }, []);

  return {
    start: state.start,
    generation: state.generation,
    restored: state.restored,
    discard,
    isSaved: (json) => json === baselineJson || json === savedOverride,
    storageKey,
    markSaved,
  };
}

/**
 * Inside the form: whether `values` differ from what is saved, the dirty
 * guard, the in-memory draft and the autosave. Returns `dirty`, and `saved`
 * to call when a save succeeded (before the page moves on), with the values
 * as saved when they are not the ones on screen now.
 */
export function useDraftAutosave<T>(
  draft: EditorDraft<T>,
  values: T,
  {
    message = UNSAVED_MESSAGE,
    clean,
  }: {
    message?: string;
    /**
     * Whether the values are saved, when the form knows better than a
     * comparison with the page's one saved value (the composer, whose saved
     * value is whichever draft it is editing).
     */
    clean?: boolean;
  } = {},
): { dirty: boolean; saved: (next?: T) => void } {
  const json = stableJson(values);
  const dirty = clean === undefined ? !draft.isSaved(json) : !clean;
  const { storageKey } = draft;

  const latestJson = useRef(json);
  useEffect(() => {
    latestJson.current = json;
  });

  const settle = useWindowDirty(dirty, message, values, (how) => {
    if (!storageKey) return;
    // Gone unasked (a Back): its last keystrokes too. Gone after "leave
    // anyway": the member chose to lose it.
    if (how === "kept") writeStored(storageKey, latestJson.current);
    else if (how === "released") removeStored(storageKey);
  });

  // Written a moment after typing stops; removed once the input is back to
  // what is saved (never merely because the form opened clean).
  const wasDirty = useRef(false);
  useEffect(() => {
    if (!storageKey) return;
    if (!dirty) {
      if (wasDirty.current) removeStored(storageKey);
      wasDirty.current = false;
      return;
    }
    wasDirty.current = true;
    const timer = window.setTimeout(
      () => writeStored(storageKey, json),
      AUTOSAVE_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dirty, json, storageKey]);

  // A tab closed or reloaded mid-pause: write what is there now.
  useEffect(() => {
    if (!storageKey || !dirty) return;
    const flush = () => writeStored(storageKey, latestJson.current);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [dirty, storageKey]);

  const { markSaved } = draft;
  const saved = useCallback(
    (next?: T) => {
      if (storageKey) removeStored(storageKey);
      settle();
      markSaved(next === undefined ? latestJson.current : stableJson(next));
    },
    [markSaved, settle, storageKey],
  );

  return { dirty, saved };
}

/** "Unsaved changes restored", with Discard, above a form that started from a draft. */
export function RestoredNote({
  onDiscard,
  disabled,
  children = "Unsaved changes restored.",
}: {
  onDiscard: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2">
        <RotateCcw aria-hidden className="h-4 w-4 shrink-0 text-accent" />
        {children}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onDiscard}
        disabled={disabled}
      >
        Discard
      </Button>
    </div>
  );
}

/** The restored note for an editor draft; nothing when it started clean. */
export function DraftRestoredNote<T>({
  draft,
  disabled,
}: {
  draft: EditorDraft<T>;
  disabled?: boolean;
}) {
  if (!draft.restored) return null;
  return <RestoredNote onDiscard={draft.discard} disabled={disabled} />;
}
