import { CAMP_TIME_ZONE } from "@camp404/core";

// The one line under a member's name that says where their application stands.
// Pure and client-safe: the server builds it for the member panel, and the
// panel rebuilds it the moment a captain decides, so the line never contradicts
// the status badge beside it.

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: CAMP_TIME_ZONE,
});

export function approvalSummary(
  status: "pending" | "approved" | "rejected",
  decided: { byName: string | null; at: Date | null } = {
    byName: null,
    at: null,
  },
): string {
  if (status === "pending") return "Awaiting a captain's decision";
  const word = status === "approved" ? "Approved" : "Rejected";
  if (!decided.byName) return word;
  const on = decided.at ? ` on ${dateFmt.format(decided.at)}` : "";
  return `${word} by ${decided.byName}${on}`;
}
