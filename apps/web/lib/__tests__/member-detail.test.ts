import { describe, expect, it } from "vitest";
import type { CampMemberDetail } from "@camp404/db/roster";
import { presentMemberDetail } from "@/lib/member-detail";

function detail(overrides: Partial<CampMemberDetail> = {}): CampMemberDetail {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Dusty Boot",
    rank: "member",
    approvalStatus: "pending",
    approvalDecidedAt: null,
    approvalDecidedByName: null,
    onboardingComplete: true,
    onboardingVersion: "2026.05.29-v8",
    responses: {},
    inviteCode: "berlin-crew",
    inviteNote: "Kitchen lead from last burn",
    invitedByName: "Alice",
    createdAt: new Date("2026-03-01T08:00:00.000Z"),
    ...overrides,
  };
}

/** Find a label/value row by its label across overview or a profile section. */
function valueOf(items: { label: string; value: string }[], label: string) {
  return items.find((i) => i.label === label)?.value;
}

describe("presentMemberDetail — overview", () => {
  it("resolves the country code to a name and flags onboarding", () => {
    const m = presentMemberDetail(
      detail({ responses: { country: "ZA" }, onboardingComplete: true }),
    );
    expect(valueOf(m.overview, "Country")).toBe("South Africa");
    expect(valueOf(m.overview, "Onboarding")).toBe("Complete");
    expect(valueOf(m.overview, "Invite code")).toBe("berlin-crew");
    expect(valueOf(m.overview, "Invited by")).toBe("Alice");
    expect(valueOf(m.overview, "Invite note")).toBe(
      "Kitchen lead from last burn",
    );
    // Always present, regardless of answers.
    expect(m.overview.some((i) => i.label === "Joined")).toBe(true);
  });

  it("marks onboarding incomplete and omits absent invite provenance", () => {
    const m = presentMemberDetail(
      detail({
        onboardingComplete: false,
        invitedByName: null,
        inviteNote: null,
        inviteCode: null,
      }),
    );
    expect(valueOf(m.overview, "Onboarding")).toBe("Incomplete");
    expect(m.overview.some((i) => i.label === "Invited by")).toBe(false);
    expect(m.overview.some((i) => i.label === "Invite note")).toBe(false);
    // A null invite code still renders a row, marked as a founder/god account.
    expect(valueOf(m.overview, "Invite code")).toMatch(/founder|god/i);
  });

  it("falls back to a placeholder display name", () => {
    expect(presentMemberDetail(detail({ displayName: "   " })).displayName).toBe(
      "Unnamed burner",
    );
    expect(presentMemberDetail(detail({ displayName: null })).displayName).toBe(
      "Unnamed burner",
    );
  });

  it("labels rank for the modal title", () => {
    expect(presentMemberDetail(detail({ rank: "captain" })).rankLabel).toBe(
      "Captain",
    );
    expect(presentMemberDetail(detail({ rank: "member" })).rankLabel).toBe(
      "Member",
    );
  });
});

describe("presentMemberDetail — profile sections", () => {
  it("groups answers by questionnaire page and resolves option labels", () => {
    const m = presentMemberDetail(
      detail({
        responses: {
          birthday: "1990-01-01",
          "id.type": "passport",
          "logistics.driving": "yes",
          "team_lead.interests": ["kitchen", "structures"],
          "competency.cooking": "create",
        },
      }),
    );

    const about = m.profileSections.find((s) => s.title === "About you");
    expect(valueOf(about!.items, "Date of birth")).toBe("1990-01-01");
    // toggle value → option label
    expect(valueOf(about!.items, "ID document")).toBe("Passport");

    const logistics = m.profileSections.find(
      (s) => s.title === "Leadership & logistics",
    );
    // single_select value → option label
    expect(valueOf(logistics!.items, "Will you be driving a car to the burn?")).toBe(
      "Yes",
    );
    // multi_select → comma-joined option labels
    expect(
      valueOf(logistics!.items, "I would like to be a team lead of…"),
    ).toBe("Kitchen, Structures");

    const cooking = m.profileSections.find(
      (s) => s.title === "Cooking competency",
    );
    // scale value → step label
    expect(
      valueOf(cooking!.items, "How would you describe your cooking?"),
    ).toBe("Good cook — I can create recipes");
  });

  it("surfaces the profile photo as an image, never as a profile row", () => {
    const url = "https://blob.example/avatar.jpg";
    const m = presentMemberDetail(
      detail({ responses: { "profile.image": url, birthday: "1990-01-01" } }),
    );
    expect(m.profileImageUrl).toBe(url);
    // The photo page must not render a "Profile photo" label/value row.
    const photoRow = m.profileSections
      .flatMap((s) => s.items)
      .find((i) => i.label === "Profile photo");
    expect(photoRow).toBeUndefined();
  });

  it("skips empty answers and pages with nothing answered", () => {
    const m = presentMemberDetail(
      detail({
        responses: {
          "bio.statement": "",
          "team_lead.interests": [],
          birthday: "1990-01-01",
        },
      }),
    );
    // Only "About you" (birthday) has a real answer.
    expect(m.profileSections.map((s) => s.title)).toEqual(["About you"]);
    expect(m.profileSections[0]!.items).toHaveLength(1);
  });

  it("produces no sections when there are no answers", () => {
    const m = presentMemberDetail(detail({ responses: {} }));
    expect(m.profileSections).toHaveLength(0);
    expect(m.profileImageUrl).toBeNull();
  });
});

describe("presentMemberDetail — approval summary", () => {
  it("describes a pending applicant", () => {
    const m = presentMemberDetail(detail({ approvalStatus: "pending" }));
    expect(m.approvalSummary).toMatch(/awaiting/i);
  });

  it("names the deciding captain on an approved member", () => {
    const m = presentMemberDetail(
      detail({
        approvalStatus: "approved",
        approvalDecidedByName: "Captain Cat",
        approvalDecidedAt: new Date("2026-04-02T10:00:00.000Z"),
      }),
    );
    expect(m.approvalSummary).toMatch(/^Approved by Captain Cat/);
  });

  it("describes a rejected member, even without a recorded decider", () => {
    const m = presentMemberDetail(
      detail({ approvalStatus: "rejected", approvalDecidedByName: null }),
    );
    expect(m.approvalSummary).toBe("Rejected");
  });
});
