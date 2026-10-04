"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  ClipboardList,
  Clock,
  CookingPot,
  FileText,
  Lock,
  MessageSquare,
  Music,
  Package,
  Search,
  SquareCheck,
  Tent,
  User,
  Volume1,
} from "lucide-react";
import { SEARCH_TEXT_LIMIT, type SearchTextMatch } from "@camp404/core";
import type { SearchKind } from "@camp404/db/search";
import { trapTab } from "@camp404/os";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@camp404/ui/components/command";
import { matchProgram } from "@/lib/program-routes";
import {
  ENTRY_KIND_LABEL,
  GROUP_CAP,
  filterPrograms,
  groupEntries,
  guideTextHref,
  isSearchShortcut,
  pushRecent,
  readRecent,
  readScope,
  recentRows,
  refKey,
  searchablePrograms,
  splitMarks,
  writeRecent,
  writeScope,
  type Mark,
  type RecentRef,
  type SearchEntry,
  type SearchHit,
  type SearchProgram,
  type SearchScope,
} from "@/lib/program-search";
import type { ClientProgram, ProgramManifest } from "@/lib/programs";
import { programIcon } from "./program-icons";

// Ctrl+K search (issue #326). Step 1 (the owner's pick, Option A of
// camp404-night/design/ctrl-k.html) found programs; step 2 (the approved
// design/search-everything.html) finds what is in them too: recipes,
// chapters, meetings, tasks, inventory, shifts, gear, lounge offers, people,
// announcements and, for leads and captains, questionnaires.
//
// Ctrl+K (Cmd+K on a Mac) anywhere on the desktop opens a box near the top
// over a dimmed desktop; inside a rich-text editor the key stays the editor's.
// Programs filter here at once, from the manifest the server filtered by rank.
// Camp entries come from /api/search as the member types (150 ms after the
// last key, the request before cancelled), each kind filtered on the server
// by the rule of the page it opens (titles, and since #350 text). With no
// connection, programs still work and the box says why entries are missing.
// The empty box lists Recent: programs and entries, kept in this browser as
// ids only and looked up again each time it opens.
//
// Search inside text (#350; owner, 2026-10-04: "If I type in fuel I might
// want the fuel app"): a two-choice toggle, Programs | Everything. Programs,
// the default, filters programs (by name, then by a few search words) in the
// browser and asks the server NOTHING, not even for Recent. Everything adds
// camp entries by title and, below them, text hits with the line they were
// found in. The choice is remembered in this browser, per member. Ctrl+K
// inside the open box switches it; Esc closes the box.
//
// The OS's own modal, like the folder-name dialog: drawn inside the desktop
// (so a phone's sheet stops at the bottom bar), focus held inside, Esc closes
// and gives focus back to where it was. Nothing runs while it is shut but one
// keydown listener.

/** How long after the last key the server is asked. */
const DEBOUNCE_MS = 150;
/** How long an answer may take before the box says it is searching. */
const SLOW_MS = 400;

const KBD =
  "inline-grid min-w-5 place-items-center border border-border px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none text-muted-foreground";

const GROUP_CLASS =
  "p-0 text-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.15em] [&_[cmdk-group-heading]]:text-muted-foreground";

const ENTRY_ICON: Record<SearchKind, (cls: string) => ReactNode> = {
  recipe: (c) => <CookingPot className={c} />,
  chapter: (c) => <BookOpen className={c} />,
  meeting: (c) => <MessageSquare className={c} />,
  task: (c) => <SquareCheck className={c} />,
  inventory: (c) => <Package className={c} />,
  shift: (c) => <Clock className={c} />,
  gear: (c) => <Tent className={c} />,
  lounge: (c) => <Music className={c} />,
  person: (c) => <User className={c} />,
  announcement: (c) => <Volume1 className={c} />,
  questionnaire: (c) => <ClipboardList className={c} />,
};

function entryIcon(entry: SearchEntry): (cls: string) => ReactNode {
  return entry.card
    ? (c) => <FileText className={c} />
    : ENTRY_ICON[entry.kind];
}

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
  /** Open an entry's exact address in its program's window. */
  onOpenEntry: (href: string) => void;
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
  onOpenEntry,
  phone = false,
}: ProgramSearchProps) {
  const list = useMemo(() => searchablePrograms(manifest), [manifest]);
  const [recent, setRecent] = useState<RecentRef[]>([]);
  const [scope, setScope] = useState<SearchScope>("programs");
  // The window an entry was opened into: when it comes to the front, the
  // entry is what was opened, not the program that shares its window.
  const entryWindow = useRef<string | null>(null);

  // Read Recent once the page is in the browser (the server has no storage).
  useEffect(() => {
    setRecent(readRecent(storage(), userId));
    setScope(readScope(storage(), userId));
  }, [userId]);

  // Every switch is remembered (never sent anywhere).
  const changeScope = useCallback(
    (next: SearchScope) => {
      setScope(next);
      writeScope(storage(), userId, next);
    },
    [userId],
  );

  const remember = useCallback(
    (ref: RecentRef) => {
      setRecent((now) => {
        if (now[0] && refKey(now[0]) === refKey(ref)) return now;
        const next = pushRecent(now, ref);
        writeRecent(storage(), userId, next);
        return next;
      });
    },
    [userId],
  );

  // A program's window coming to the front counts as opened, however it was
  // opened (an icon, the Start menu, a link, search).
  useEffect(() => {
    if (!liveKey) return;
    if (entryWindow.current === liveKey) {
      entryWindow.current = null;
      return;
    }
    const entry = list.find(
      (e) => matchProgram(e.program.href)?.instanceKey === liveKey,
    );
    if (entry) remember({ kind: "program", id: entry.program.id });
  }, [liveKey, list, remember]);

  // Entries the server no longer returns for this member go from Recent.
  const forget = useCallback(
    (gone: ReadonlySet<string>) => {
      setRecent((now) => {
        const next = now.filter((r) => !gone.has(refKey(r)));
        if (next.length === now.length) return now;
        writeRecent(storage(), userId, next);
        return next;
      });
    },
    [userId],
  );

  // Ctrl+K / Cmd+K opens it; pressed again inside the open box, it switches
  // between Programs and Everything (Esc closes).
  const openRef = useRef(open);
  const scopeRef = useRef(scope);
  useEffect(() => {
    openRef.current = open;
    scopeRef.current = scope;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      if (openRef.current) {
        changeScope(
          scopeRef.current === "programs" ? "everything" : "programs",
        );
      } else {
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, changeScope]);

  if (!open) return null;
  return (
    <SearchBox
      list={list}
      recent={recent}
      scope={scope}
      onScope={changeScope}
      phone={phone}
      onClose={() => onOpenChange(false)}
      onForget={forget}
      onPickProgram={(program) => {
        onOpenChange(false);
        onOpenProgram(program);
      }}
      onPickEntry={(entry) => {
        onOpenChange(false);
        if (entry) {
          entryWindow.current = matchProgram(entry.href)?.instanceKey ?? null;
          remember({ kind: entry.kind, id: entry.id });
        }
      }}
      onOpenEntry={onOpenEntry}
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

/** The shortcut's own name: "Ctrl K", or "⌘ K" on a Mac. */
function shortcutName(mod: string): string {
  return `${mod} K`;
}

/** The taskbar's quiet hint, a button too: "Ctrl K · Search". */
export function SearchHint({ onOpen }: { onOpen: () => void }) {
  const mod = useModKey();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search"
      aria-keyshortcuts="Control+K Meta+K"
      data-os-search-hint
      className="flex h-8 shrink-0 items-center whitespace-nowrap px-2 font-pixel text-[10px] uppercase tracking-[0.12em] text-os-fg/85 outline-none hover:text-os-fg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-os-fg max-lg:hidden"
    >
      {shortcutName(mod)} · Search
    </button>
  );
}

// --- Asking the server ---------------------------------------------------------------

type EntryStatus = "idle" | "loading" | "done" | "offline" | "failed";

interface EntryState {
  /** The text the entries answer. */
  query: string;
  status: EntryStatus;
  entries: SearchEntry[];
}

async function fetchEntries(
  params: string,
  signal: AbortSignal,
): Promise<SearchEntry[] | "offline" | "failed"> {
  try {
    const res = await fetch(`/api/search?${params}`, {
      signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return "failed";
    const body = (await res.json()) as { entries?: SearchEntry[] };
    return Array.isArray(body.entries) ? body.entries : "failed";
  } catch (err) {
    if (signal.aborted) throw err;
    // fetch rejects (rather than answering) only when the network is down.
    return "offline";
  }
}

/**
 * The camp entries for the typed text: asked DEBOUNCE_MS after the last key,
 * the request before cancelled. The last answer stays while the next is on
 * its way (the list narrows it at once, client-side), so rows never blink.
 */
function useEntrySearch(query: string): EntryState & { slow: boolean } {
  const [state, setState] = useState<EntryState>({
    query: "",
    status: "idle",
    entries: [],
  });
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!query) {
      setState({ query: "", status: "idle", entries: [] });
      setSlow(false);
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    const timer = setTimeout(() => {
      fetchEntries(`q=${encodeURIComponent(query)}`, ctrl.signal).then(
        (answer) => {
          clearTimeout(slowTimer);
          setSlow(false);
          setState(
            typeof answer === "string"
              ? { query, status: answer, entries: [] }
              : { query, status: "done", entries: answer },
          );
        },
        () => {
          // Aborted: a newer request owns the state.
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(slowTimer);
      ctrl.abort();
    };
  }, [query]);
  return { ...state, slow };
}

/**
 * Recent entries, looked up again on the server when the box opens in
 * Everything (or first switches to it). Those it does not return (gone, or no
 * longer the member's to open) are forgotten. In Programs nothing is asked,
 * and nothing is forgotten.
 */
function useRecentEntries(
  recent: readonly RecentRef[],
  onForget: (gone: ReadonlySet<string>) => void,
  enabled: boolean,
): ReadonlyMap<string, SearchEntry> {
  const refs = recent.filter((r) => r.kind !== "program");
  const key = refs.map(refKey).join(",");
  const [found, setFound] = useState<ReadonlyMap<string, SearchEntry>>(
    new Map(),
  );
  const forget = useRef(onForget);
  useEffect(() => {
    forget.current = onForget;
  });
  // Asked once per box: the list it asks about is the one it opened with.
  const asked = useRef(key);
  const answered = useRef(false);
  useEffect(() => {
    const wanted = asked.current;
    if (!enabled || !wanted || answered.current) return;
    const ctrl = new AbortController();
    fetchEntries(`recent=${encodeURIComponent(wanted)}`, ctrl.signal).then(
      (answer) => {
        if (typeof answer === "string") return;
        answered.current = true;
        const map = new Map(answer.map((e) => [refKey(e), e]));
        setFound(map);
        forget.current(new Set(wanted.split(",").filter((k) => !map.has(k))));
      },
      () => {},
    );
    return () => ctrl.abort();
  }, [enabled]);
  return found;
}

// --- The box -----------------------------------------------------------------------

/** One row of the list, whatever it opens. */
interface RowModel {
  value: string;
  title: string;
  marks: Mark[];
  detail: string;
  /** Letters of the detail to light: a program's matched search word. */
  detailMarks?: Mark[];
  /** A text hit's line: where, and the words around the match. */
  line?: SearchTextMatch;
  icon: (cls: string) => ReactNode;
  /** What a screen reader hears: "title, kind, detail". */
  label: string;
  /** "Show N more", in the group's quieter style. */
  more?: boolean;
  onSelect: () => void;
}

interface GroupModel {
  key: string;
  heading: string;
  /** "5 found", on the heading's right, when the group has more than shows. */
  count?: string;
  rows: RowModel[];
}

function programRow(
  p: SearchProgram,
  marks: Mark[],
  onPick: (program: ClientProgram) => void,
  keyword?: SearchHit["keyword"],
): RowModel {
  return {
    value: `program:${p.program.id}`,
    title: p.program.label,
    marks,
    // Found by a search word: the word first, lit ("Fuel cans · Power and
    // Lighting"), so the member sees why Power answers "fuel".
    detail: keyword ? `${keyword.text} · ${p.where}` : p.where,
    detailMarks: keyword?.marks,
    icon: programIcon(p.program),
    label: keyword
      ? `${p.program.label}, Program, ${keyword.text}, ${p.where}`
      : `${p.program.label}, Program, ${p.where}`,
    onSelect: () => onPick(p.program),
  };
}

/** "in the method" as it is heard after "found": "found in the method". */
function foundWhere(line: SearchTextMatch): string {
  return line.where.charAt(0).toLowerCase() + line.where.slice(1);
}

function entryRow(
  entry: SearchEntry,
  marks: Mark[],
  detail: string,
  onPick: (entry: SearchEntry) => void,
  line?: SearchTextMatch,
): RowModel {
  const kind = entry.card ? "Duty card" : ENTRY_KIND_LABEL[entry.kind];
  return {
    value: refKey(entry),
    title: entry.title,
    marks,
    detail,
    line,
    icon: entryIcon(entry),
    label: [
      entry.title,
      kind,
      detail === kind ? "" : detail,
      line ? `found ${foundWhere(line)}: ${line.text}` : "",
    ]
      .filter(Boolean)
      .join(", "),
    onSelect: () => onPick(entry),
  };
}

/** Recent's detail names the kind first: "Recipe · 40 plates". */
function recentDetail(entry: SearchEntry): string {
  const kind = ENTRY_KIND_LABEL[entry.kind];
  if (entry.kind === "chapter" || !entry.detail) return entry.detail || kind;
  return `${kind} · ${entry.detail}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the status line says when the toggle moves. */
const SCOPE_SAID: Record<SearchScope, string> = {
  programs: "Programs only.",
  everything: "Everything: programs, recipes, chapters, meetings and more.",
};

const SCOPE_LABEL: Record<SearchScope, string> = {
  programs: "Programs",
  everything: "Everything",
};

const SCOPES: readonly SearchScope[] = ["programs", "everything"];

/**
 * Programs | Everything: a radio group of two, one tab stop (the checked
 * one), the arrow keys move between them. Its keys stay its own, so Enter on
 * it never opens the picked row.
 */
function ScopeToggle({
  scope,
  onScope,
  phone,
  onPointerPick,
}: {
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  phone: boolean;
  /** A click (not a key): the field takes focus back, for typing on. */
  onPointerPick: () => void;
}) {
  const refs = useRef<Record<SearchScope, HTMLButtonElement | null>>({
    programs: null,
    everything: null,
  });
  return (
    <div
      role="radiogroup"
      aria-label="Search in"
      data-search-scope
      className={`flex shrink-0 border border-border ${phone ? "w-full" : ""}`}
      onKeyDown={(e) => {
        const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
        if (keys.includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          const next = scope === "programs" ? "everything" : "programs";
          onScope(next);
          refs.current[next]?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          // A radio is chosen by moving to it; Enter must not open a row.
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {SCOPES.map((value) => {
        const on = scope === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={(e) => {
              onScope(value);
              if (e.detail > 0) onPointerPick();
            }}
            className={`font-semibold leading-tight outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
              phone
                ? "flex-1 py-2.5 text-center text-[13px]"
                : "px-2.5 py-[5px] text-xs"
            } ${
              on
                ? "bg-[var(--color-pick)] text-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {SCOPE_LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}

function SearchBox({
  list,
  recent,
  scope,
  onScope,
  phone,
  onClose,
  onForget,
  onPickProgram,
  onPickEntry,
  onOpenEntry,
}: {
  list: readonly SearchProgram[];
  recent: readonly RecentRef[];
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
  phone: boolean;
  onClose: () => void;
  onForget: (gone: ReadonlySet<string>) => void;
  onPickProgram: (program: ClientProgram) => void;
  /** An entry was picked (null: the guide's text search). */
  onPickEntry: (entry: SearchEntry | null) => void;
  onOpenEntry: (href: string) => void;
}) {
  const id = useId();
  const mod = useModKey();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState("");
  // The member moved the selection (arrows, the pointer) since they typed.
  const moved = useRef(false);
  const picked = useRef(false);
  const typed = query.trim();
  const everything = scope === "everything";
  // Programs asks the server nothing: no text, no Recent.
  const answer = useEntrySearch(everything ? typed : "");
  const recentEntries = useRecentEntries(recent, onForget, everything);

  // The toggle moved (a click, the arrows, Ctrl+K, the "Search everything"
  // row): the status line says so, until the text changes.
  const [switched, setSwitched] = useState(false);
  const firstScope = useRef(scope);
  useEffect(() => {
    if (scope !== firstScope.current) {
      firstScope.current = scope;
      setSwitched(true);
    }
  }, [scope]);
  useEffect(() => {
    setSwitched(false);
  }, [typed]);

  // Focus the field; on the way out (Esc, Cancel, a click outside), focus
  // goes back to where it was. Not after a pick: the window takes it.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // A search field (cmdk draws a text one): phones label the key Go and
    // offer the search keyboard.
    input.current?.setAttribute("type", "search");
    input.current?.focus({ preventScroll: true });
    return () => {
      if (!picked.current && before?.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  const pickProgram = (program: ClientProgram) => {
    picked.current = true;
    onPickProgram(program);
  };
  const pickEntry = (entry: SearchEntry) => {
    picked.current = true;
    onPickEntry(entry);
    onOpenEntry(entry.href);
  };
  const pickGuideText = () => {
    picked.current = true;
    onPickEntry(null);
    onOpenEntry(guideTextHref(typed));
  };
  const focusField = () => input.current?.focus({ preventScroll: true });

  // --- What the list holds ---
  const offline =
    everything && (answer.status === "offline" || answer.status === "failed");
  const programHits = typed ? filterPrograms(list, typed) : [];
  const entryGroups =
    everything && typed && !offline
      ? groupEntries(answer.entries, typed, answer.query)
      : [];
  const entryCount = entryGroups.reduce((n, g) => n + g.hits.length, 0);
  const settled = answer.status === "done" && answer.query === typed;
  const groups: GroupModel[] = [];

  if (!typed) {
    // In Programs, Recent is programs only: an entry would need the server.
    const rows = recentRows(
      list,
      everything ? recent : recent.filter((r) => r.kind === "program"),
      recentEntries,
    );
    if (rows.length > 0) {
      groups.push({
        key: "recent",
        heading: "Recent",
        rows: rows.map((r) =>
          r.type === "program"
            ? programRow(r.program, [], pickProgram)
            : entryRow(r.entry, [], recentDetail(r.entry), pickEntry),
        ),
      });
    } else {
      groups.push({
        key: "programs",
        heading: "Programs",
        rows: list.map((p) => programRow(p, [], pickProgram)),
      });
    }
  } else {
    const capped = (
      key: string,
      heading: string,
      rows: RowModel[],
      moreLabel: string,
      over: { full?: boolean; tail?: RowModel[] } = {},
    ) => {
      const open = expanded.has(key) || rows.length <= GROUP_CAP;
      const shown = open ? rows : rows.slice(0, GROUP_CAP);
      const hidden = rows.length - shown.length;
      groups.push({
        key,
        heading,
        count:
          rows.length > GROUP_CAP || over.full
            ? `${rows.length}${over.full ? "+" : ""} found`
            : undefined,
        rows: [
          ...shown,
          ...(hidden > 0
            ? [
                {
                  value: `more:${key}`,
                  title: `Show ${hidden} more ${moreLabel}`,
                  marks: [],
                  detail: "",
                  icon: (c: string) => <Search className={c} />,
                  label: `Show ${hidden} more ${moreLabel}`,
                  more: true,
                  onSelect: () => {
                    setExpanded((now) => new Set([...now, key]));
                    // The first row the press reveals takes the selection.
                    setSelected(rows[GROUP_CAP]!.value);
                  },
                },
              ]
            : []),
          ...(over.tail ?? []),
        ],
      });
    };
    if (programHits.length > 0) {
      capped(
        "programs",
        "Programs",
        programHits.map((h) => programRow(h, h.marks, pickProgram, h.keyword)),
        "programs",
      );
    } else if (!everything) {
      // Programs found nothing: hand the words to Everything.
      groups.push({
        key: "programs",
        heading: "",
        rows: [
          {
            value: "scope:everything",
            title: `Search everything for “${typed}”`,
            marks: [],
            detail: phone ? "" : "Recipes, chapters, meetings and more",
            icon: (c) => <Search className={c} />,
            label: `Search everything for “${typed}”, Recipes, chapters, meetings and more`,
            onSelect: () => {
              onScope("everything");
              focusField();
            },
          },
        ],
      });
    }
    for (const g of entryGroups) {
      const full = g.textHits >= SEARCH_TEXT_LIMIT;
      capped(
        g.kind,
        g.label,
        g.hits.map((h) =>
          entryRow(h.entry, h.marks, h.entry.detail, pickEntry, h.line),
        ),
        g.label.toLowerCase(),
        {
          full,
          // More chapters mention it than search shows: the guide's own
          // full-text page lists them all.
          tail:
            g.kind === "chapter" && full
              ? [
                  {
                    value: "guide-text",
                    title: `Every chapter that mentions “${typed}”`,
                    marks: [],
                    detail: "Survival Guide",
                    icon: (c) => <BookOpen className={c} />,
                    label: `Every chapter that mentions “${typed}”, Survival Guide`,
                    more: true,
                    onSelect: pickGuideText,
                  },
                ]
              : [],
        },
      );
    }
  }

  const nothing =
    everything &&
    typed &&
    settled &&
    programHits.length === 0 &&
    entryCount === 0;
  const total = programHits.length + entryCount;

  // --- The selection ---
  // cmdk's arrows move it; until the member moves it, it sits on the first
  // row, so entries arriving under the programs never take it away, and with
  // no program the first entry takes it once it comes.
  const values = groups.flatMap((g) => g.rows.map((r) => r.value));
  const first = values[0] ?? "";
  const holds = values.includes(selected);
  useEffect(() => {
    if (!moved.current || !holds) setSelected(first);
  }, [first, holds]);
  useEffect(() => {
    moved.current = false;
    setExpanded(new Set());
  }, [typed, scope]);

  // --- What is said ---
  const programsFound = plural(programHits.length, "program", "programs");
  const footer = !typed
    ? ""
    : !everything
      ? programHits.length > 0
        ? programsFound
        : "No program found"
      : offline
        ? "Programs only: no connection"
        : answer.slow && !settled
          ? "Searching camp…"
          : nothing
            ? "Nothing found"
            : settled || total > 0
              ? `${total} found`
              : "";
  const counted = !typed
    ? ""
    : !everything
      ? programHits.length > 0
        ? `${programsFound} found.`
        : "No program found."
      : offline
        ? `${programsFound} found. Camp entries need a connection.`
        : answer.slow && !settled
          ? "Searching camp…"
          : settled
            ? nothing
              ? "Nothing found."
              : `${programsFound} and ${plural(entryCount, "entry", "entries")} found.`
            : "";
  const said = [switched ? SCOPE_SAID[scope] : "", counted]
    .filter(Boolean)
    .join(" ");
  const toggle = (
    <ScopeToggle
      scope={scope}
      onScope={onScope}
      phone={phone}
      onPointerPick={focusField}
    />
  );

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
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            moved.current = true;
          }
          trapTab(e, box.current);
        }}
        className={`os-window-colours flex flex-col bg-popover text-popover-foreground ${
          phone
            ? "h-full border-t border-os-primary"
            : "absolute left-1/2 top-[8vh] w-[37.5rem] max-w-[calc(100%-2rem)] -translate-x-1/2 border border-os-primary shadow-[0_0_30px_color-mix(in_oklab,var(--os-primary)_40%,transparent),0_20px_50px_rgb(0_0_0/0.6)]"
        }`}
      >
        <h2 id={`${id}-title`} className="sr-only">
          Search
        </h2>
        <Command
          shouldFilter={false}
          // cmdk's Ctrl+J/K/N/P would take Ctrl+K inside the box; here it
          // switches between Programs and Everything.
          vimBindings={false}
          loop
          label="Search"
          value={selected}
          onValueChange={setSelected}
          className="h-auto min-h-0 flex-1 rounded-none bg-transparent text-inherit [&_[cmdk-input-wrapper]]:border-border [&_[cmdk-input-wrapper]]:px-4"
        >
          <div
            className={
              phone
                ? "flex items-center gap-3 p-3 [&_[cmdk-input-wrapper]]:flex-1 [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:border-os-primary [&_[cmdk-input-wrapper]]:bg-background [&_[cmdk-input-wrapper]]:px-3"
                : "flex items-center gap-2.5 border-b border-border pr-4 [&_[cmdk-input-wrapper]]:min-w-0 [&_[cmdk-input-wrapper]]:flex-1 [&_[cmdk-input-wrapper]]:border-b-0"
            }
          >
            <CommandInput
              ref={input}
              value={query}
              onValueChange={setQuery}
              enterKeyHint="go"
              placeholder={
                !everything
                  ? "Search programs…"
                  : phone
                    ? "Search everything…"
                    : "Search programs, recipes, chapters, people…"
              }
              aria-label="Search"
              className={`[&::-webkit-search-cancel-button]:hidden ${
                phone ? "h-10 py-0 text-base" : "h-14 text-[17px] font-medium"
              }`}
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
              <>
                {toggle}
                <span aria-hidden className={KBD}>
                  Esc
                </span>
              </>
            )}
          </div>
          {phone && (
            <div className="border-b border-border px-3 pb-2.5">{toggle}</div>
          )}
          <CommandList
            aria-busy={answer.status === "loading" ? true : undefined}
            onPointerMove={() => {
              moved.current = true;
            }}
            className={
              phone
                ? "max-h-none min-h-0 flex-1 overscroll-contain"
                : "max-h-[min(32rem,70vh)]"
            }
          >
            {groups.map((g, gi) => (
              <CommandGroup
                key={g.key}
                heading={
                  g.heading ? (
                    <span className="flex items-baseline">
                      <span>{g.heading}</span>
                      {g.count && (
                        <span className="ml-auto font-sans text-[11px] font-medium normal-case tracking-normal">
                          {g.count}
                        </span>
                      )}
                    </span>
                  ) : undefined
                }
                className={`${GROUP_CLASS} ${phone && gi > 0 ? "border-t border-border" : ""}`}
              >
                {g.rows.map((row) => (
                  <Row key={row.value} row={row} phone={phone} />
                ))}
              </CommandGroup>
            ))}
            {nothing && (
              <div className="px-4 pt-5 pb-4 text-sm text-foreground">
                <p>Nothing you can open mentions “{typed}”.</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Search looks at names and titles, recipes in the book,
                  Survival Guide chapters, meeting notes and the announcements
                  you were sent. Check the spelling, or try one word.
                </p>
              </div>
            )}
            {typed && offline && (
              <p
                data-testid="search-offline"
                className="mx-4 mt-1.5 mb-3 border border-dashed border-border px-3 py-2.5 text-[13px] text-muted-foreground"
              >
                <b className="font-semibold text-foreground">
                  {answer.status === "offline"
                    ? "Camp entries need a connection."
                    : "Camp entries could not be loaded."}
                </b>{" "}
                Programs still work.
                {answer.status === "offline"
                  ? " On site there is no internet: use the printed duty cards and daily sheet."
                  : " Try again in a moment."}
              </p>
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
              <span className="flex items-center gap-1" data-search-switch-hint>
                <kbd className={KBD}>{shortcutName(mod)}</kbd>{" "}
                {everything ? "programs only" : "everything"}
              </span>
              <span className="ml-auto" data-testid="search-footer-status">
                {footer}
              </span>
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

function Marked({
  text,
  marks,
  className,
}: {
  text: string;
  marks: readonly Mark[];
  className: string;
}) {
  return (
    <>
      {splitMarks(text, marks).map((part, i) =>
        part.hit ? (
          <mark key={i} className={className}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Row({ row, phone }: { row: RowModel; phone: boolean }) {
  const title = (
    <span
      className={`min-w-0 truncate ${phone ? "text-[15px]" : ""} ${row.more ? "text-[13px] text-muted-foreground" : ""}`}
    >
      <Marked
        text={row.title}
        marks={row.marks}
        className="bg-transparent font-bold text-primary"
      />
    </span>
  );
  const detail = row.detail ? (
    <span
      className={
        phone
          ? "truncate text-xs text-muted-foreground"
          : "ml-auto max-w-[48%] shrink-0 truncate pl-3 text-xs text-muted-foreground"
      }
    >
      <Marked
        text={row.detail}
        marks={row.detailMarks ?? []}
        className="bg-transparent font-bold text-foreground"
      />
    </span>
  ) : null;
  const line = row.line ? (
    <span
      data-search-line
      className={`overflow-hidden text-muted-foreground [-webkit-box-orient:vertical] [display:-webkit-box] ${
        phone
          ? "text-[13px] leading-[1.45] [-webkit-line-clamp:3]"
          : "text-[12.5px] leading-[1.45] [-webkit-line-clamp:2]"
      }`}
    >
      <span
        className={`mr-1.5 whitespace-nowrap text-[11px] font-semibold ${
          row.line.membersOnly ? "text-primary" : "text-os-accent"
        }`}
      >
        {row.line.membersOnly && (
          <Lock
            aria-hidden
            className="mr-[3px] inline !size-[11px] align-[-1px]"
          />
        )}
        {row.line.where}
      </span>
      <Marked
        text={row.line.text}
        marks={row.line.marks}
        className="bg-[color-mix(in_oklab,var(--color-primary)_30%,transparent)] px-px font-bold text-foreground"
      />
    </span>
  ) : null;
  return (
    <CommandItem
      value={row.value}
      aria-label={row.label}
      onSelect={row.onSelect}
      data-search-row={row.value}
      className={`gap-3 rounded-none px-4 text-sm data-[selected='true']:bg-[var(--color-pick)] data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_3px_0_0_0_var(--color-primary)] ${
        phone ? "min-h-12 border-b border-border py-2" : "min-h-10 py-1.5"
      } ${line ? "items-start !py-2" : ""}`}
    >
      <span
        aria-hidden
        className={`grid size-[26px] shrink-0 place-items-center border border-[color-mix(in_oklab,var(--os-accent)_60%,transparent)] text-os-accent ${row.more ? "border-dashed" : ""} ${line ? "mt-px" : ""}`}
      >
        {row.icon("size-4")}
      </span>
      {line ? (
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span
            className={
              phone
                ? "flex min-w-0 flex-col gap-0.5"
                : "flex min-w-0 items-baseline"
            }
          >
            {title}
            {detail}
          </span>
          {line}
        </span>
      ) : phone ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          {title}
          {detail}
        </span>
      ) : (
        <>
          {title}
          {detail}
        </>
      )}
    </CommandItem>
  );
}
