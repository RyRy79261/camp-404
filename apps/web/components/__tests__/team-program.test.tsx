import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A team's program (docs/specs/2026-09-27-team-programs.md): its About card
// (description and links, ruling 4), its announcements (ruling 3), Power and
// Lighting's power plan at a glance (ruling 2), and the Edit dialog a
// captain or the team's lead gets (ruling 1).

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("@/app/(console)/teams/[key]/actions", () => ({
  saveTeamProgramAction: vi.fn(async () => ({
    ok: true,
    data: { version: 2 },
  })),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { saveTeamProgramAction } from "@/app/(console)/teams/[key]/actions";
import { PowerGlanceCard } from "@/components/teams/power-glance-card";
import { TeamAboutCard } from "@/components/teams/team-about-card";
import { TeamAboutEditor } from "@/components/teams/team-about-editor";
import { TeamAnnouncementsCard } from "@/components/teams/team-announcements-card";
import type { PowerGlance } from "@/lib/power-glance";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("TeamAboutCard", () => {
  it("shows the description and the links, opening in a new tab", () => {
    render(
      <TeamAboutCard
        description="We keep the lights on."
        links={[{ label: "Grid plan", url: "https://example.com/grid" }]}
      />,
    );
    expect(screen.getByText("We keep the lights on.")).toBeTruthy();
    const link = within(
      screen.getByRole("list", { name: "Team links" }),
    ).getByRole("link", { name: "Grid plan" });
    expect(link.getAttribute("href")).toBe("https://example.com/grid");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("never draws a stored link that is not a web address", () => {
    render(
      <TeamAboutCard
        description=""
        links={[
          { label: "Bad", url: "javascript:alert(1)" },
          { label: "Good", url: "https://example.com" },
        ]}
      />,
    );
    expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
    expect(screen.getByRole("link", { name: "Good" })).toBeTruthy();
    expect(
      screen.getByText("Nobody has written what this team does yet."),
    ).toBeTruthy();
  });

  it("has no Edit control unless the page passes one", () => {
    render(<TeamAboutCard description="x" links={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("TeamAnnouncementsCard", () => {
  it("lists what the team sent, and says when there is more", () => {
    render(
      <TeamAnnouncementsCard
        items={[
          {
            id: "a1",
            title: "Fill the bowser",
            body: "Bring gloves.",
            senderName: "Cap",
            sentAt: new Date("2026-09-20T08:00:00Z"),
          },
        ]}
        more
      />,
    );
    const list = screen.getByRole("list", { name: "Team announcements" });
    expect(within(list).getByText("Fill the bowser")).toBeTruthy();
    expect(within(list).getByText("Bring gloves.")).toBeTruthy();
    expect(within(list).getByText("20 Sept 2026 · Cap")).toBeTruthy();
    expect(screen.getByText("The latest 1 are shown.")).toBeTruthy();
  });

  it("says when the team has sent nothing", () => {
    render(<TeamAnnouncementsCard items={[]} more={false} />);
    expect(
      screen.getByText("This team hasn’t sent any announcements yet."),
    ).toBeTruthy();
  });
});

const GLANCE: PowerGlance = {
  loadCount: 1,
  peak: { watts: 1065, kva: 1.33125, assumesAllOn: false },
  generator: {
    model: "Test 5.5",
    ratedKva: 5.5,
    kvaBasedPct: 24.2,
    band: "green",
  },
  fuel: {
    litresWithMargin: 236.7,
    safetyMarginPct: 20,
    days: 10,
    cans: 12,
    canLitres: 20,
    cansOwned: 0,
  },
};

describe("PowerGlanceCard", () => {
  function tile(name: string) {
    return screen.getByRole("article", { name });
  }

  it("shows the four headline figures", () => {
    render(<PowerGlanceCard glance={GLANCE} canEdit={false} />);
    expect(tile("Peak load").textContent).toContain("1.07 kW");
    expect(tile("Generator load").textContent).toContain("24.2%");
    expect(tile("Generator load").textContent).toContain("Comfortable");
    expect(tile("Fuel for the burn").textContent).toContain("236.7 L");
    expect(tile("Jerry cans").textContent).toContain("12");
  });

  it("gives a reader links to read the plan, and an editor links to edit it", () => {
    render(<PowerGlanceCard glance={GLANCE} canEdit={false} />);
    expect(
      screen.getByRole("link", { name: "See the load list" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
    cleanup();
    render(<PowerGlanceCard glance={GLANCE} canEdit />);
    expect(
      screen
        .getByRole("link", { name: "Edit the load list" })
        .getAttribute("href"),
    ).toBe("/power/loads");
    expect(
      screen
        .getByRole("link", { name: "Edit the fuel plan" })
        .getAttribute("href"),
    ).toBe("/power/fuel");
  });

  it("says what is missing before there is a plan", () => {
    render(
      <PowerGlanceCard
        glance={{ loadCount: 0, peak: null, generator: null, fuel: null }}
        canEdit={false}
      />,
    );
    expect(tile("Peak load").textContent).toContain("No loads on the list yet");
    expect(tile("Generator load").textContent).toContain(
      "No generator chosen yet",
    );
  });
});

describe("TeamAboutEditor", () => {
  function open() {
    render(
      <TeamAboutEditor
        team="water"
        teamLabel="Water"
        description="Old words."
        links={[]}
        version={1}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit what Water does and its links",
      }),
    );
    return screen.getByRole("dialog", { name: "About Water" });
  }

  it("saves the description and links for its team and version", async () => {
    const dialog = open();
    fireEvent.change(within(dialog).getByLabelText("What the team does"), {
      target: { value: "We bring the water." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add a link" }));
    fireEvent.change(within(dialog).getByLabelText("Link 1 name"), {
      target: { value: "Tank log" },
    });
    fireEvent.change(within(dialog).getByLabelText("Link 1 address"), {
      target: { value: "https://example.com/tanks" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(saveTeamProgramAction).toHaveBeenCalledWith({
      team: "water",
      description: "We bring the water.",
      links: [{ label: "Tank log", url: "https://example.com/tanks" }],
      expectedVersion: 1,
    });
  });

  it("shows a bad address beside its field and sends nothing", () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add a link" }));
    fireEvent.change(within(dialog).getByLabelText("Link 1 name"), {
      target: { value: "Sneaky" },
    });
    fireEvent.change(within(dialog).getByLabelText("Link 1 address"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      within(dialog).getByText(
        "A link must be a web address that starts with https:// or http://.",
      ),
    ).toBeTruthy();
    expect(saveTeamProgramAction).not.toHaveBeenCalled();
  });

  it("shows the server's refusal at the foot of the dialog", async () => {
    vi.mocked(saveTeamProgramAction).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed this team's description first. Reload the page.",
    });
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      "Someone changed this team's description first. Reload the page.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
