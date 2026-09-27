import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import {
  defaultDesktopPreferences,
  type DesktopPreferences,
} from "@camp404/types";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";

// The welcome wizard (issue #289) and the system themes on the desktop root
// (issue #290), driven with a stand-in router as in desktop-shell.test.tsx.

const nav = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  save: vi.fn(async (_patch: unknown) => ({ ok: true as const })),
  seen: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: nav.refresh,
    prefetch: vi.fn(),
  }),
}));
vi.mock("@/app/(console)/desktop-layout-actions", () => ({
  saveDesktopLayoutAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/(console)/desktop-preferences-actions", () => ({
  saveDesktopPreferencesAction: actions.save,
  markWelcomeSeenAction: actions.seen,
}));
vi.mock("@/app/(console)/notifications/actions", () => ({
  fetchNotificationPanelAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("@/components/push/device-token", () => ({
  forgetDeviceToken: vi.fn(),
}));

import { Desktop, type DesktopProps } from "../desktop-shell";

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: "camp_member",
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

const UNSEEN = defaultDesktopPreferences();
const SEEN: DesktopPreferences = {
  ...UNSEEN,
  welcomeSeenAt: "2026-09-20T08:00:00.000Z",
};

function props(over: Partial<DesktopProps> = {}): DesktopProps {
  const mode = over.mode ?? "full";
  return {
    mode,
    manifest: buildProgramManifest(
      facts({ mode, approved: mode !== "restricted" }),
    ),
    layout: { cells: {}, items: [] },
    userId: "u-1",
    account: { name: "Ada", rank: "Member", leads: [] },
    preferences: UNSEEN,
    children: <h1 className="sr-only">Desktop</h1>,
    ...over,
  };
}

const wizard = () =>
  screen.queryByRole("dialog", { name: "Welcome to 404 OS" });
const desktop = () => document.getElementById("os-desktop")!;
const openStart = () =>
  fireEvent.click(screen.getByRole("button", { name: "Start" }));

beforeEach(() => {
  nav.pathname = "/";
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the welcome wizard", () => {
  it("opens by itself on a full desktop the member has never closed it on, focused on its heading", async () => {
    render(<Desktop {...props()} />);
    const panel = wizard();
    expect(panel).not.toBeNull();
    await act(async () => {});
    expect(document.activeElement).toBe(
      within(panel!).getByRole("heading", { name: "Welcome" }),
    );
    expect(within(panel!).getByText("Step 1 of 7")).toBeTruthy();
  });

  it("walks its steps with Next and Back, each heading taking focus", async () => {
    render(<Desktop {...props()} />);
    const panel = wizard()!;
    const titles: string[] = [];
    for (let i = 0; i < 6; i++) {
      fireEvent.click(within(panel).getByRole("button", { name: "Next" }));
      await act(async () => {});
      titles.push(document.activeElement?.textContent ?? "");
    }
    expect(titles).toEqual([
      "Opening things",
      "Windows",
      "Your desktop",
      "Today",
      "How it looks",
      "Done",
    ]);
    expect(within(panel).queryByRole("button", { name: "Next" })).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "Skip for now" }),
    ).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Back" }));
    await act(async () => {});
    expect(document.activeElement?.textContent).toBe("How it looks");
  });

  it("closes on Esc, counts that as seen once, and hands focus back to the desktop", async () => {
    render(<Desktop {...props()} />);
    await act(async () => {});
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(wizard()).toBeNull();
    expect(actions.seen).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(desktop().contains(document.activeElement)).toBe(true);

    // Start > Welcome opens it again; closing it does not save again.
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Welcome" }));
    expect(wizard()).not.toBeNull();
    fireEvent.click(
      within(wizard()!).getByRole("button", { name: "Skip for now" }),
    );
    expect(wizard()).toBeNull();
    expect(actions.seen).toHaveBeenCalledTimes(1);
  });

  it("counts Skip for now as seen", () => {
    render(<Desktop {...props()} />);
    fireEvent.click(
      within(wizard()!).getByRole("button", { name: "Skip for now" }),
    );
    expect(wizard()).toBeNull();
    expect(actions.seen).toHaveBeenCalledTimes(1);
  });

  it("stays shut for a member who closed it before, until Start > Welcome", () => {
    render(<Desktop {...props({ preferences: SEEN })} />);
    expect(wizard()).toBeNull();
    openStart();
    fireEvent.click(screen.getByRole("menuitem", { name: "Welcome" }));
    expect(wizard()).not.toBeNull();
  });

  it("never opens on the restricted desktop of an applicant waiting for approval, which has no Welcome in Start", () => {
    render(<Desktop {...props({ mode: "restricted" })} />);
    expect(wizard()).toBeNull();
    openStart();
    expect(screen.queryByRole("menuitem", { name: "Welcome" })).toBeNull();
  });

  it("never opens over a blocking form (the held desktop)", () => {
    nav.pathname = "/questionnaires/tent-check";
    render(<Desktop {...props({ mode: "held" })} />);
    expect(wizard()).toBeNull();
  });

  it("turns on Open with one click from its second step, saved at once", async () => {
    render(<Desktop {...props()} />);
    const panel = wizard()!;
    fireEvent.click(within(panel).getByRole("button", { name: "Next" }));
    fireEvent.click(
      within(panel).getByRole("switch", { name: /Open with one click/ }),
    );
    await act(async () => {});
    expect(actions.save).toHaveBeenCalledWith({ oneClickOpen: true });
  });

  it("changes the theme from How it looks: the desktop wears it at once, and it is saved", async () => {
    render(<Desktop {...props()} />);
    const panel = wizard()!;
    for (let i = 0; i < 5; i++) {
      fireEvent.click(within(panel).getByRole("button", { name: "Next" }));
    }
    expect(desktop().getAttribute("data-os-theme")).toBe("night");
    fireEvent.click(within(panel).getByRole("radio", { name: /Calm/ }));
    expect(desktop().getAttribute("data-os-theme")).toBe("calm");
    await act(async () => {});
    expect(actions.save).toHaveBeenCalledWith({ theme: "calm" });
    fireEvent.click(within(panel).getByRole("switch", { name: /Bigger text/ }));
    expect(desktop().getAttribute("data-os-text")).toBe("bigger");
    expect(within(panel).getByText("In use")).toBeTruthy();
  });
});

describe("saving display choices", () => {
  it("sends them one after another, in the order they were made", async () => {
    let finishFirst: () => void = () => {};
    actions.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ ok: true });
        }),
    );
    render(<Desktop {...props()} />);
    const panel = wizard()!;
    for (let i = 0; i < 5; i++) {
      fireEvent.click(within(panel).getByRole("button", { name: "Next" }));
    }
    fireEvent.click(within(panel).getByRole("radio", { name: /Calm/ }));
    await act(async () => {});
    fireEvent.click(
      within(panel).getByRole("radio", { name: /High contrast/ }),
    );
    await act(async () => {});
    // The second waits for the first.
    expect(actions.save.mock.calls).toEqual([[{ theme: "calm" }]]);
    await act(async () => finishFirst());
    expect(actions.save.mock.calls).toEqual([
      [{ theme: "calm" }],
      [{ theme: "high-contrast" }],
    ]);
    expect(desktop().getAttribute("data-os-theme")).toBe("high-contrast");
  });
});

describe("the theme on the desktop root", () => {
  const layers = () => ({
    grid: document.querySelectorAll(".os-grid").length,
    scanlines: document.querySelectorAll(".os-scanlines").length,
    noise: document.querySelectorAll(".os-noise").length,
    beam: document.querySelectorAll("[data-os-scanbeam]").length,
    glitch: document.querySelectorAll("[data-os-wordmark]").length,
    still: document.querySelectorAll("[data-os-wordmark-still]").length,
  });

  it("draws the member's theme and switches from the first render", () => {
    render(
      <Desktop
        {...props({
          preferences: {
            ...SEEN,
            theme: "high-contrast",
            biggerText: true,
            effectsOff: true,
          },
        })}
      />,
    );
    expect(desktop().getAttribute("data-os-theme")).toBe("high-contrast");
    expect(desktop().getAttribute("data-os-text")).toBe("bigger");
    expect(desktop().getAttribute("data-os-effects")).toBe("off");
  });

  it("404 Night: every CRT layer and the glitched wordmark", () => {
    render(<Desktop {...props({ preferences: SEEN })} />);
    expect(layers()).toEqual({
      grid: 1,
      scanlines: 1,
      noise: 1,
      beam: 1,
      // The desktop's and the phone home screen's (CSS shows one).
      glitch: 2,
      still: 0,
    });
    expect(desktop().hasAttribute("data-os-effects")).toBe(false);
  });

  it("Calm: the surface without its beam, the wordmark still", () => {
    render(<Desktop {...props({ preferences: { ...SEEN, theme: "calm" } })} />);
    expect(layers()).toEqual({
      grid: 1,
      scanlines: 1,
      noise: 1,
      beam: 0,
      glitch: 0,
      still: 2,
    });
  });

  it.each([
    ["High contrast", { theme: "high-contrast" as const }],
    ["Effects off", { effectsOff: true }],
  ])("%s: no CRT layer and no glitch in the page at all", (_what, over) => {
    render(<Desktop {...props({ preferences: { ...SEEN, ...over } })} />);
    expect(layers()).toEqual({
      grid: 0,
      scanlines: 0,
      noise: 0,
      beam: 0,
      glitch: 0,
      still: 2,
    });
  });
});
