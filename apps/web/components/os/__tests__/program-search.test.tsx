import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { ViewerRank } from "@camp404/types";
import { matchProgram } from "@/lib/program-routes";
import {
  RECENT_PREFIX_V1,
  recentStorageKey,
  type SearchEntry,
} from "@/lib/program-search";
import {
  buildProgramManifest,
  type ClientProgram,
  type ProgramManifest,
} from "@/lib/programs";
import { ProgramSearch } from "../program-search";

// The Ctrl+K box (issue #326), alone: the shortcut, the keyboard, Esc giving
// focus back, Enter opening a program the Start menu's way (step 1); camp
// entries from /api/search, debounced and cancelled, grouped with "Show N
// more", nothing found, no connection, and Recent with entries (step 2). The
// rank filter is the manifest's (program-search.test.ts); the entries' rules
// are the server's (packages/db search.test.ts).

beforeAll(() => {
  // cmdk scrolls the picked row into view; JSDOM has no layout.
  Element.prototype.scrollIntoView ??= () => {};
});

const USER = "user-1";

function manifest(rank: ViewerRank = ViewerRank.enum.camp_member) {
  return buildProgramManifest({
    mode: "full",
    approved: true,
    rank,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
  });
}

function Harness({
  m,
  onOpenProgram,
  onOpenEntry = () => {},
  liveKey = null,
}: {
  m: ProgramManifest;
  onOpenProgram: (p: ClientProgram) => void;
  onOpenEntry?: (href: string) => void;
  liveKey?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">Before</button>
      <div contentEditable suppressContentEditableWarning data-testid="editor">
        <p>text</p>
      </div>
      <ProgramSearch
        manifest={m}
        userId={USER}
        liveKey={liveKey}
        open={open}
        onOpenChange={setOpen}
        onOpenProgram={onOpenProgram}
        onOpenEntry={onOpenEntry}
      />
    </>
  );
}

const ctrlK = (target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: "k", ctrlKey: true });
const dialog = () => screen.queryByRole("dialog", { name: "Search" });
const field = () => within(dialog()!).getByRole("combobox");
const picked = () =>
  dialog()!.querySelector<HTMLElement>('[aria-selected="true"]');

function entry(
  kind: SearchEntry["kind"],
  title: string,
  detail = "",
): SearchEntry {
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return { kind, id, title, detail, href: `/${kind}/${id}` };
}

/** What /api/search answers: by the asked text, or a network failure. */
let answers: (url: string) => SearchEntry[] | "offline";
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  const answer = answers(url);
  if (answer === "offline") throw new TypeError("Failed to fetch");
  return { ok: true, json: async () => ({ entries: answer }) } as Response;
});

/** Let the debounce pass and the answer land. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  await act(async () => {});
}

const type = (value: string) =>
  fireEvent.change(field(), { target: { value } });
const option = (name: string | RegExp) =>
  within(dialog()!).queryByRole("option", { name });

beforeEach(() => {
  window.localStorage.clear();
  answers = () => [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ProgramSearch", () => {
  it("opens on Ctrl+K and on Cmd+K, with the field in focus", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    expect(dialog()).toBeNull();
    ctrlK();
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    // Ctrl+K again shuts it.
    ctrlK(field());
    expect(dialog()).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(dialog()).not.toBeNull();
  });

  it("leaves Ctrl+K to a rich-text editor", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    const inside = screen.getByTestId("editor").querySelector("p")!;
    ctrlK(inside);
    expect(dialog()).toBeNull();
  });

  it("filters programs as you type, before the server answers; arrows move; Enter opens the picked program", async () => {
    const open = vi.fn();
    render(<Harness m={manifest()} onOpenProgram={open} />);
    ctrlK();
    type("pow");
    // At once: no request has gone yet.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(picked()?.getAttribute("aria-label")).toMatch(/^Power, Program, /);
    // The match is highlighted.
    expect(picked()!.querySelector("mark")?.textContent).toBe("Pow");
    await settle();
    expect(screen.getByRole("status")?.textContent).toMatch(
      /programs? and 0 entries found/,
    );

    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(picked()?.getAttribute("aria-label")).toMatch(
      /^Power and Lighting, /,
    );
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0].href).toBe("/power");
    expect(dialog()).toBeNull();
  });

  it("asks the server once the typing stops, cancelling the request before", async () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    type("p");
    type("po");
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    type("pot");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/search?q=pot");

    // A request still out when the text changes is aborted.
    type("pots");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const signal = fetchMock.mock.calls[1]![1]!.signal!;
    type("pot");
    expect(signal.aborted).toBe(true);
  });

  it("groups entries under the programs, and the selection stays on the first program", async () => {
    const openEntry = vi.fn();
    answers = () => [
      entry("recipe", "Potjiekos for 40", "40 plates"),
      entry("person", "Spotty van Wyk", "Kitchen · Team Lead"),
    ];
    render(
      <Harness
        m={manifest()}
        onOpenProgram={vi.fn()}
        onOpenEntry={openEntry}
      />,
    );
    ctrlK();
    type("pow");
    const first = picked()?.getAttribute("aria-label");
    type("pot");
    await settle();
    expect(option(/^Potjiekos for 40, Recipe, 40 plates$/)).toBeTruthy();
    expect(within(dialog()!).getByText("Recipes")).toBeTruthy();
    expect(within(dialog()!).getByText("People")).toBeTruthy();
    // No program called "pot": the first entry is picked.
    expect(first).toMatch(/^Power, /);
    expect(picked()?.getAttribute("aria-label")).toMatch(/^Potjiekos/);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(openEntry).toHaveBeenCalledWith("/recipe/potjiekos-for-40");
    // Opened, it is Recent: the kind and id, never the title.
    expect(
      JSON.parse(window.localStorage.getItem(recentStorageKey(USER))!),
    ).toEqual([{ kind: "recipe", id: "potjiekos-for-40" }]);
  });

  it("keeps the selection on a program when entries arrive under it", async () => {
    answers = () => [entry("inventory", "Power cable reel, 50 m")];
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    type("power");
    expect(picked()?.getAttribute("aria-label")).toMatch(/^Power, Program/);
    await settle();
    expect(option(/^Power cable reel/)).toBeTruthy();
    expect(picked()?.getAttribute("aria-label")).toMatch(/^Power, Program/);
  });

  it("shows three a group, and Show N more opens the rest in place", async () => {
    answers = () =>
      ["Pot bread", "Potjiekos", "Potato salad", "Pot pie", "Potage"].map((t) =>
        entry("recipe", t),
      );
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    type("pot");
    await settle();
    const heading = dialog()!.querySelector("[cmdk-group-heading]")!;
    expect(heading.textContent).toBe("Recipes5 found");
    expect(option(/^Potato salad, /)).toBeNull();
    const more = option("Show 2 more recipes")!;
    expect(more).toBeTruthy();
    fireEvent.click(more);
    expect(dialog()).not.toBeNull();
    expect(option(/^Potato salad, /)).toBeTruthy();
    expect(option("Show 2 more recipes")).toBeNull();
  });

  it("says so when nothing matches, and offers the guide's own text search", async () => {
    const openEntry = vi.fn();
    render(
      <Harness
        m={manifest()}
        onOpenProgram={vi.fn()}
        onOpenEntry={openEntry}
      />,
    );
    ctrlK();
    type("xylophone");
    await settle();
    expect(dialog()?.textContent).toMatch(
      /Nothing you can open is called “xylophone”/,
    );
    expect(screen.getByTestId("search-footer-status").textContent).toBe(
      "Nothing found",
    );
    const guide = option(/Search the Survival Guide's text for “xylophone”/)!;
    expect(guide.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(openEntry).toHaveBeenCalledWith("/guide?q=xylophone");
  });

  it("with no connection, programs still filter and the box says why entries are missing", async () => {
    answers = () => "offline";
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    type("pow");
    await settle();
    expect(option(/^Power, Program/)).toBeTruthy();
    expect(screen.getByTestId("search-offline").textContent).toMatch(
      /Camp entries need a connection\. Programs still work\./,
    );
    expect(screen.getByTestId("search-footer-status").textContent).toBe(
      "Programs only: no connection",
    );
    // The guide's text search needs the server too: not offered.
    expect(option(/Search the Survival Guide's text/)).toBeNull();
    // Nothing retries on its own.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never lists a captain's program to a member", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    type("camp");
    // Present first, then the absence.
    expect(option(/^Camp layout, /)).toBeTruthy();
    expect(option(/^Camp settings, /)).toBeNull();
  });

  it("Esc shuts it and gives focus back to where it was", () => {
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();
    ctrlK(before);
    expect(document.activeElement).toBe(field());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("lists the programs opened last when the box is empty", () => {
    const m = manifest();
    const power = matchProgram("/power/loads")!.instanceKey;
    const { rerender } = render(
      <Harness m={m} onOpenProgram={vi.fn()} liveKey={null} />,
    );
    rerender(<Harness m={m} onOpenProgram={vi.fn()} liveKey={power} />);
    expect(
      JSON.parse(window.localStorage.getItem(recentStorageKey(USER))!),
    ).toEqual([{ kind: "program", id: "power" }]);
    act(() => {
      ctrlK();
    });
    expect(within(dialog()!).getByText("Recent")).toBeTruthy();
    const rows = within(dialog()!).getAllByRole("option");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("aria-label")).toMatch(/^Power, /);
    // Programs only: nothing to ask the server.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks recent entries up again, and forgets the ones the server drops", async () => {
    window.localStorage.setItem(
      recentStorageKey(USER),
      JSON.stringify([
        { kind: "recipe", id: "potjiekos-for-40" },
        { kind: "program", id: "power" },
        { kind: "recipe", id: "not-yours" },
      ]),
    );
    answers = (url) =>
      url.includes("recent=") ? [entry("recipe", "Potjiekos for 40")] : [];
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    ctrlK();
    await act(async () => {});
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/search?recent=${encodeURIComponent("recipe:potjiekos-for-40,recipe:not-yours")}`,
    );
    const rows = within(dialog()!).getAllByRole("option");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Potjiekos for 40, Recipe",
      expect.stringMatching(/^Power, Program/),
    ]);
    expect(
      JSON.parse(window.localStorage.getItem(recentStorageKey(USER))!),
    ).toEqual([
      { kind: "recipe", id: "potjiekos-for-40" },
      { kind: "program", id: "power" },
    ]);
  });

  it("moves step 1's Recent over", () => {
    window.localStorage.setItem(
      `${RECENT_PREFIX_V1}${USER}`,
      JSON.stringify(["power"]),
    );
    render(<Harness m={manifest()} onOpenProgram={vi.fn()} />);
    act(() => {
      ctrlK();
    });
    expect(option(/^Power, Program/)).toBeTruthy();
    expect(
      window.localStorage.getItem(`${RECENT_PREFIX_V1}${USER}`),
    ).toBeNull();
  });
});
