import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AnnouncementPickerData,
  AnnouncementSummary,
} from "@camp404/db/broadcasts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({
  deleteDraftAction: vi.fn(),
  previewPublishAction: vi.fn(),
  publishAction: vi.fn(),
  saveDraftAction: vi.fn(),
  setPinnedAction: vi.fn(),
  updateDraftAction: vi.fn(),
}));
vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => false,
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AnnouncementsManager } from "./announcements-manager";
import { PeoplePicker } from "./people-picker";

// "Specific people…" (#313, owner 2026-10-02): one OR several members, picked
// by a name search that adds chips, with a line saying who it goes to.

const PEOPLE = [
  { id: "jess", name: "Jess Naidoo", teams: ["kitchen"] },
  { id: "jessica", name: "Jessica Ford", teams: ["build"] },
  { id: "sipho", name: "Sipho Ndlovu", teams: [] },
  { id: "rae", name: "Rae Adams", teams: [] },
];
const TEAMS = { kitchen: "Kitchen", build: "Build" };

function Harness({ start = [] as string[] }) {
  const [chosen, setChosen] = useState<string[]>(start);
  return (
    <PeoplePicker
      people={PEOPLE}
      chosen={chosen}
      onChange={setChosen}
      teamLabels={TEAMS}
    />
  );
}

const search = () => screen.getByLabelText("People");

describe("PeoplePicker", () => {
  it("finds members by any word of their name and adds each as a chip", () => {
    render(<Harness />);
    expect(screen.getByText("Pick at least one person.")).toBeTruthy();

    fireEvent.change(search(), { target: { value: "jes" } });
    const matches = within(
      screen.getByRole("list", { name: "Matching people" }),
    );
    expect(matches.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Jess NaidooKitchen",
      "Jessica FordBuild",
    ]);
    fireEvent.click(matches.getByRole("button", { name: /Jess Naidoo/ }));
    expect(screen.getByText("Goes to Jess Naidoo only.")).toBeTruthy();

    // "ndl" is Sipho's surname.
    fireEvent.change(search(), { target: { value: "ndl" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(
      screen.getByText("Goes to Jess Naidoo and Sipho Ndlovu."),
    ).toBeTruthy();
    const chips = within(screen.getByRole("list", { name: "Chosen people" }));
    expect(chips.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.change(search(), { target: { value: "rae" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(screen.getByText("Goes to 3 people.")).toBeTruthy();
  });

  it("never offers someone already chosen, and says when no one matches", () => {
    render(<Harness start={["jess"]} />);
    fireEvent.change(search(), { target: { value: "jess" } });
    const matches = within(
      screen.getByRole("list", { name: "Matching people" }),
    );
    expect(matches.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Jessica FordBuild",
    ]);
    fireEvent.change(search(), { target: { value: "zz" } });
    expect(screen.getByText("No one by that name.")).toBeTruthy();
  });

  it("takes a person off with their chip's remove button", () => {
    render(<Harness start={["jess", "sipho"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Jess Naidoo" }));
    expect(screen.getByText("Goes to Sipho Ndlovu only.")).toBeTruthy();
  });
});

const PICKER: AnnouncementPickerData = {
  people: PEOPLE,
  drivers: [PEOPLE[2]!, PEOPLE[3]!],
};

function draft(
  overrides: Partial<AnnouncementSummary> & { id: string; title: string },
): AnnouncementSummary {
  return {
    body: "Body text",
    presentation: "popup",
    audience: { scope: "everyone" },
    senderId: "me",
    senderName: "Me",
    publishedAt: null,
    pinnedAt: null,
    pinOnPublish: false,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    recipientCount: 0,
    acknowledgedCount: 0,
    readCount: 0,
    ...overrides,
  };
}

describe("drafts to the drivers and to chosen people", () => {
  it("names the audience on each card and on its publish button", () => {
    render(
      <AnnouncementsManager
        currentUserId="me"
        audienceOptions={[
          { value: "everyone", label: "Everyone in camp", group: "Camp" },
          { value: "drivers", label: "Drivers this year", group: "People" },
          { value: "individual", label: "Specific people…", group: "People" },
        ]}
        teamLabels={TEAMS}
        leadTeams={null}
        picker={PICKER}
        announcements={[
          draft({
            id: "d1",
            title: "Fill up in Ceres",
            audience: { scope: "drivers" },
          }),
          draft({
            id: "d2",
            title: "Your shade cloth",
            audience: { scope: "individual", userIds: ["jess"] },
          }),
          draft({
            id: "d3",
            title: "Trailer keys",
            audience: {
              scope: "individual",
              userIds: ["jess", "sipho", "rae"],
            },
          }),
        ]}
      />,
    );
    const card = (title: string) =>
      within(screen.getByRole("heading", { name: title }).closest("li")!);

    const drivers = card("Fill up in Ceres");
    expect(drivers.getByText("Drivers")).toBeTruthy();
    expect(drivers.getByText(/for drivers this year/)).toBeTruthy();
    expect(
      drivers.getByRole("button", { name: /Publish to 2 drivers/ }),
    ).toBeTruthy();

    const one = card("Your shade cloth");
    expect(one.getByText(/for Jess Naidoo only/)).toBeTruthy();
    expect(one.getByRole("button", { name: /Publish to Jess$/ })).toBeTruthy();

    const three = card("Trailer keys");
    expect(three.getAllByText(/3 people/).length).toBeGreaterThan(0);
    expect(
      three.getByRole("button", { name: /Publish to 3 people/ }),
    ).toBeTruthy();
  });

  it("opens a chosen-people draft for editing with its people as chips", () => {
    render(
      <AnnouncementsManager
        currentUserId="me"
        audienceOptions={[
          { value: "everyone", label: "Everyone in camp" },
          { value: "individual", label: "Specific people…" },
        ]}
        teamLabels={TEAMS}
        leadTeams={null}
        picker={PICKER}
        announcements={[
          draft({
            id: "d2",
            title: "Your shade cloth",
            audience: { scope: "individual", userIds: ["jess", "sipho"] },
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const chips = within(screen.getByRole("list", { name: "Chosen people" }));
    expect(chips.getByText("Jess Naidoo")).toBeTruthy();
    expect(chips.getByText("Sipho Ndlovu")).toBeTruthy();
    expect(
      screen.getByText("Goes to Jess Naidoo and Sipho Ndlovu."),
    ).toBeTruthy();
  });
});
