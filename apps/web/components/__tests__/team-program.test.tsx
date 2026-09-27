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
// (its description, ruling 4; no links to outside tools), its announcements
// (ruling 3), Power and Lighting's power plan at a glance (ruling 2), and the
// Edit dialog a captain or the team's lead gets (ruling 1).

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
  it("shows the description, and no links of any kind", () => {
    render(<TeamAboutCard description="We keep the lights on." />);
    expect(screen.getByText("We keep the lights on.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says when nobody has written one yet", () => {
    render(<TeamAboutCard description="" />);
    expect(
      screen.getByText("Nobody has written what this team does yet."),
    ).toBeTruthy();
  });

  it("has no Edit control unless the page passes one", () => {
    render(<TeamAboutCard description="x" />);
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
        version={1}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit what Water does" }),
    );
    return screen.getByRole("dialog", { name: "About Water" });
  }

  it("saves the description for its team and version, and offers no links", async () => {
    const dialog = open();
    expect(within(dialog).queryByRole("button", { name: /link/i })).toBeNull();
    expect(within(dialog).queryByLabelText(/link/i)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("What the team does"), {
      target: { value: "We bring the water." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(saveTeamProgramAction).toHaveBeenCalledWith({
      team: "water",
      description: "We bring the water.",
      expectedVersion: 1,
    });
  });

  it("shows a description over the limit beside its field and sends nothing", () => {
    const dialog = open();
    const box = within(dialog).getByLabelText("What the team does");
    box.removeAttribute("maxlength");
    fireEvent.change(box, { target: { value: "x".repeat(301) } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      within(dialog).getByText("Keep the description under 300 characters."),
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
