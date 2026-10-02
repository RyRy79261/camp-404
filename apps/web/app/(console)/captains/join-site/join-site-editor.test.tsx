import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JOIN_CONTENT } from "@camp404/types";
import type { JoinEditorData } from "@/lib/join-site";

// The Join site editor (approved redesign, 2026-10-01): one section open at a
// time, one Save for the page that sends only what changed, and a mistake
// named by where it is before anything is sent.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ saveJoinPageAction: vi.fn() }));

import { saveJoinPageAction } from "./actions";
import { JoinSiteEditor, placeOf } from "./join-site-editor";

const DATA: JoinEditorData = {
  year: 2027,
  yearIsSet: true,
  yearName: null,
  burn: null,
  content: DEFAULT_JOIN_CONTENT,
  teams: [
    {
      key: "kitchen",
      label: "Kitchen",
      description: "",
      defaultDescription: "Menu and recipes.",
    },
    {
      key: "finance",
      label: "Finance",
      description: "Fees.",
      defaultDescription: "Fees, budgeting, accounts.",
    },
  ],
};

const status = () => screen.getByRole("status");
const nav = () => screen.getByRole("navigation", { name: "Sections" });
// The section list is drawn twice (a column, and a phone screen that CSS
// shows below a medium window); jsdom has no CSS, so the first is the column.
const navButton = (name: string) =>
  within(nav()).getAllByRole("button", { name: new RegExp(name) })[0]!;
const openSection = (name: string) => fireEvent.click(navButton(name));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save page" }));

beforeEach(() => {
  vi.mocked(saveJoinPageAction).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Join site editor", () => {
  it("opens on Who we are, lists every section, and has nothing to save", () => {
    render(<JoinSiteEditor data={DATA} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Who we are" }),
    ).toBeTruthy();
    expect(
      within(nav().querySelector("ul")!).getAllByRole("button"),
    ).toHaveLength(10);
    expect(status().textContent).toBe("No changes");
    expect(
      (screen.getByRole("button", { name: "Save page" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("saves only the section that changed, and says it is saved", async () => {
    render(<JoinSiteEditor data={DATA} />);
    openSection("Where we are");
    fireEvent.change(screen.getByLabelText("Where we are on the map"), {
      target: { value: "Block 7 · Street B" },
    });
    expect(status().textContent).toBe("1 section not saved: Where we are");
    expect(
      navButton("Where we are").innerHTML,
    ).toContain("Not saved");

    save();
    await waitFor(() => expect(saveJoinPageAction).toHaveBeenCalledTimes(1));
    expect(saveJoinPageAction).toHaveBeenCalledWith({
      sections: {
        map: { ...DEFAULT_JOIN_CONTENT.map, where: "Block 7 · Street B" },
      },
    });
    await waitFor(() =>
      expect(status().textContent).toBe(
        "Saved. About and join.camp-404.com show the new words.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps edits in two sections and saves both with one Save", async () => {
    render(<JoinSiteEditor data={DATA} />);
    openSection("Where we are");
    fireEvent.change(screen.getByLabelText("Where we are on the map"), {
      target: { value: "Block 7" },
    });
    openSection("How to join");
    fireEvent.change(screen.getByLabelText("Button"), {
      target: { value: "JOIN" },
    });
    expect(status().textContent).toBe(
      "2 sections not saved: Where we are, How to join",
    );
    save();
    await waitFor(() => expect(saveJoinPageAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(saveJoinPageAction).mock.calls[0]![0];
    expect(Object.keys(sent.sections ?? {}).sort()).toEqual(["apply", "map"]);
  });

  it("sends only the team lines that changed", async () => {
    render(<JoinSiteEditor data={DATA} />);
    openSection("How the camp works");
    fireEvent.change(screen.getByLabelText("What Kitchen does"), {
      target: { value: "Two meals a day." },
    });
    save();
    await waitFor(() => expect(saveJoinPageAction).toHaveBeenCalledTimes(1));
    expect(saveJoinPageAction).toHaveBeenCalledWith({
      sections: {},
      teamLines: { kitchen: "Two meals a day." },
    });
  });

  it("names the line a mistake is on, and sends nothing", () => {
    render(<JoinSiteEditor data={DATA} />);
    openSection("What you put in");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add a line before the Burn" })[0]!,
    );
    save();
    expect(
      within(screen.getByRole("alert")).getByText(
        "Before the Burn, line 4, When: Write something here.",
      ),
    ).toBeTruthy();
    // The footer says it too, wherever the captain has scrolled.
    expect(status().textContent).toBe(
      "Not saved. What you put in: Before the Burn, line 4, When: Write something here.",
    );
    expect(saveJoinPageAction).not.toHaveBeenCalled();
  });

  it("opens the section the server refused, with its sentence", async () => {
    vi.mocked(saveJoinPageAction).mockResolvedValue({
      ok: false,
      error: "Give both days, or clear both.",
      section: "schedule",
    });
    render(<JoinSiteEditor data={DATA} />);
    openSection("What you put in");
    fireEvent.change(screen.getByLabelText("First day"), {
      target: { value: "2027-04-27" },
    });
    openSection("Who we are");
    save();
    expect(
      await screen.findByText("Give both days, or clear both."),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "What you put in" }),
    ).toBeTruthy();
  });

  it("moves a row with its menu, and Discard puts everything back", async () => {
    render(<JoinSiteEditor data={DATA} />);
    openSection("Getting there");
    const table = screen.getByRole("table", { name: "The log" });
    const firstLine = DEFAULT_JOIN_CONTENT.truck.entries[0]!;
    expect(
      (within(table).getAllByRole("textbox")[0] as HTMLTextAreaElement).value,
    ).toBe(firstLine);

    const menu = within(table).getByRole("button", {
      name: "Line 1: move or delete",
    });
    await act(async () => {
      fireEvent.keyDown(menu, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));
    });
    expect(
      (within(table).getAllByRole("textbox")[1] as HTMLTextAreaElement).value,
    ).toBe(firstLine);
    expect(status().textContent).toBe("1 section not saved: Getting there");

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(status().textContent).toBe("No changes");
    expect(
      (
        within(screen.getByRole("table", { name: "The log" })).getAllByRole(
          "textbox",
        )[0] as HTMLTextAreaElement
      ).value,
    ).toBe(firstLine);
  });
});

describe("placeOf", () => {
  it("says where a problem is in the editor's own words", () => {
    expect(placeOf("schedule", ["before", 3, "what"])).toBe(
      "Before the Burn, line 4, What happens",
    );
    expect(placeOf("fee", ["usdRate", "randsPerDollar"])).toBe(
      "Rands per dollar",
    );
    expect(placeOf("crew", ["capacity", "min"])).toBe(
      "Smallest camp that can run",
    );
  });
});
