import type { Question } from "@camp404/types";
import type { CampMemberDetail } from "@camp404/db/roster";
import { QUESTIONNAIRE } from "./questionnaire";
import { COUNTRIES } from "./countries";

// Intentionally not `import "server-only"` — `presentMemberDetail` is a pure
// function exercised in unit tests under jsdom (see __tests__/member-detail).
// Its only callers are the camp-management server action (which fetches the
// DB-bound `CampMemberDetail`) and the client modal, which imports the types
// with `import type` so nothing here reaches a client bundle.

// Serializable view-model for the camp-management member modal. Built on the
// server so the (heavy) questionnaire catalogue and a member's raw answers
// never ship to the client — the modal renders flat label/value pairs.

export interface DetailItem {
  label: string;
  value: string;
}

export interface DetailSection {
  title: string;
  items: DetailItem[];
}

export interface PresentedMember {
  id: string;
  displayName: string;
  rankLabel: string;
  approvalStatus: "pending" | "approved" | "rejected";
  approvalSummary: string;
  /** The profile photo URL, if the member uploaded one. */
  profileImageUrl: string | null;
  overview: DetailItem[];
  /** Burner-profile answers, grouped by questionnaire page. */
  profileSections: DetailSection[];
}

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.value, c.label]));

const dateFmt = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" });

/** Resolve a stored answer to a human label, mapping option values where the
 * question carries a label set. Returns null for empty/absent answers so the
 * caller can skip them. */
function renderAnswer(question: Question, raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  // Resolve a stored value to its human label. `scale` carries its choices on
  // `steps`; every other labelled kind uses `options`.
  const optionLabel = (val: string): string => {
    if (question.kind === "scale") {
      const step = question.steps.find((s) => s.value === val);
      if (step) return step.label;
      return val;
    }
    if ("options" in question) {
      const opt = question.options.find((o) => o.value === val);
      if (opt) return opt.label;
    }
    return val;
  };

  switch (question.kind) {
    case "image":
      // Surfaced as the avatar, not as a row.
      return null;
    case "multi_select": {
      if (!Array.isArray(raw) || raw.length === 0) return null;
      return raw.map((v) => optionLabel(String(v))).join(", ");
    }
    case "single_select":
    case "scale":
    case "toggle":
    case "combobox":
      return optionLabel(String(raw));
    case "slider":
      return String(raw);
    case "date":
    case "short_text":
    case "long_text":
    default:
      return String(raw);
  }
}

function describeApproval(detail: CampMemberDetail): string {
  switch (detail.approvalStatus) {
    case "approved":
      return detail.approvalDecidedByName
        ? `Approved by ${detail.approvalDecidedByName}${
            detail.approvalDecidedAt
              ? ` on ${dateFmt.format(detail.approvalDecidedAt)}`
              : ""
          }`
        : "Approved";
    case "rejected":
      return detail.approvalDecidedByName
        ? `Rejected by ${detail.approvalDecidedByName}${
            detail.approvalDecidedAt
              ? ` on ${dateFmt.format(detail.approvalDecidedAt)}`
              : ""
          }`
        : "Rejected";
    case "pending":
    default:
      return "Awaiting a captain's decision";
  }
}

export function presentMemberDetail(
  detail: CampMemberDetail,
): PresentedMember {
  const responses = detail.responses;

  const profileImageUrl =
    typeof responses["profile.image"] === "string"
      ? (responses["profile.image"] as string)
      : null;

  const overview: DetailItem[] = [];
  const country =
    typeof responses["country"] === "string"
      ? (responses["country"] as string)
      : null;
  if (country) {
    overview.push({
      label: "Country",
      value: COUNTRY_NAME.get(country) ?? country,
    });
  }
  overview.push({
    label: "Joined",
    value: dateFmt.format(detail.createdAt),
  });
  overview.push({
    label: "Onboarding",
    value: detail.onboardingComplete ? "Complete" : "Incomplete",
  });
  overview.push({
    label: "Invite code",
    value: detail.inviteCode ?? "— (founder / god account)",
  });
  if (detail.invitedByName) {
    overview.push({ label: "Invited by", value: detail.invitedByName });
  }
  if (detail.inviteNote) {
    overview.push({ label: "Invite note", value: detail.inviteNote });
  }

  // Group answers by questionnaire page, skipping intro pages and any page
  // that ended up with no answered questions.
  const profileSections: DetailSection[] = [];
  for (const page of QUESTIONNAIRE.pages) {
    if (page.kind !== "questions") continue;
    const items: DetailItem[] = [];
    for (const question of page.questions) {
      const value = renderAnswer(question, responses[question.id]);
      if (value != null) items.push({ label: question.prompt, value });
    }
    if (items.length > 0) {
      profileSections.push({ title: page.title, items });
    }
  }

  return {
    id: detail.id,
    displayName: detail.displayName?.trim() || "Unnamed burner",
    rankLabel: detail.rank === "captain" ? "Captain" : "Member",
    approvalStatus: detail.approvalStatus,
    approvalSummary: describeApproval(detail),
    profileImageUrl,
    overview,
    profileSections,
  };
}
