// The issue label taxonomy, and the only place it is written down. Ported
// from the AfrikaBurn contributors app, with Camp 404's own areas.
//
// `namespace: value` is on purpose: a triager or an agent splits on ":" to read
// the type, status, priority or area, instead of guessing from free text.
// `.github/workflows/labels.yml` creates and updates these labels on the
// repository when this file changes on main. It never deletes a label.
//
// Plain data, no I/O: the in-app reporter (apps/web/lib/github-feedback.ts),
// the issue forms test and the sync script all read the same list.

export interface GithubLabel {
  /** GitHub caps a name at 50 characters. */
  name: string;
  /** 6-digit hex, no leading "#". */
  color: string;
  /** GitHub refuses a description over 100 characters with a 422. */
  description: string;
}

export const GITHUB_LABELS: readonly GithubLabel[] = [
  // type: what the issue is (exactly one)
  { name: "type: bug", color: "d73a4a", description: "Something is broken" },
  { name: "type: feature", color: "0e8a16", description: "New capability" },
  {
    name: "type: enhancement",
    color: "a2eeef",
    description: "Improvement to something that exists",
  },
  { name: "type: docs", color: "0075ca", description: "Documentation only" },
  {
    name: "type: chore",
    color: "fef2c0",
    description: "Refactor, dependencies, tooling, tests",
  },
  {
    name: "type: copy",
    color: "bfd4f2",
    description: "Wording in the app: wrong, unclear, or promises too much",
  },
  {
    name: "type: design",
    color: "d876e3",
    description: "How a screen looks, reads or behaves",
  },

  // status: where the issue is in the workflow
  {
    name: "needs-triage",
    color: "e99695",
    description: "Entry state: not yet sorted",
  },
  {
    // Never on an in-app report: it carries no reporter identity, so nobody
    // can answer and the issue would wait forever.
    name: "status: needs-info",
    color: "d4c5f9",
    description:
      "Waiting on the person who filed it. Never on an in-app report",
  },
  {
    name: "status: in-progress",
    color: "c2e0c6",
    description: "Someone is working on it",
  },
  { name: "status: blocked", color: "b60205", description: "Cannot go on yet" },
  {
    name: "status: wontfix",
    color: "e6e6e6",
    description: "Seen, will not be done",
  },
  {
    name: "status: duplicate",
    color: "cfd3d7",
    description: "Tracked in another issue",
  },

  // priority: set at triage, never by the person who filed it
  {
    name: "priority: critical",
    color: "b60205",
    description: "Data loss, a privacy breach, or the camp cannot use the app",
  },
  {
    name: "priority: high",
    color: "d93f0b",
    description: "A main feature is broken",
  },
  {
    name: "priority: medium",
    color: "fbca04",
    description: "Noticeable, with a workaround",
  },
  { name: "priority: low", color: "0e8a16", description: "Minor or cosmetic" },

  // Who does the work. A routine may sort an issue; a person decides when
  // `needs-human` is on it.
  {
    name: "auto-triaged",
    color: "ededed",
    description: "A routine sorted this issue, not a person",
  },
  {
    name: "needs-human",
    color: "f9d0c4",
    description:
      "Needs a person's judgement. A routine may propose, never decide",
  },
  {
    name: "agent: ready",
    color: "5319e7",
    description: "Sorted and scoped: safe for an agent to build",
  },
  {
    name: "agent: in-progress",
    color: "8a63d2",
    description: "An agent is working on it (has an open PR)",
  },

  // source: where the issue came from
  {
    name: "source: in-app",
    color: "5319e7",
    description:
      "Filed by the in-app reporter: a member's words, posted with the maintainer's token",
  },

  // area: the part of the app
  {
    name: "area: onboarding",
    color: "c5def5",
    description: "Sign-up, invite codes, the burner profile, approval",
  },
  {
    name: "area: roster",
    color: "c5def5",
    description: "Members, teams, captain notes, export, payments",
  },
  {
    name: "area: questionnaires",
    color: "c5def5",
    description: "Questionnaire builder, sends, answers and results",
  },
  {
    name: "area: notifications",
    color: "c5def5",
    description: "Inbox, announcements, push, email, reminders",
  },
  {
    name: "area: auth",
    color: "c5def5",
    description: "Sign-in, accounts, sessions, deletion",
  },
  {
    name: "area: privacy",
    color: "c5def5",
    description: "Personal data, who reads it, audit, erasure",
  },
  {
    name: "area: data",
    color: "c5def5",
    description: "Schema, migrations, the year rollover",
  },
  {
    name: "area: ui",
    color: "c5def5",
    description: "Layout, styling, components",
  },
];

/**
 * The labels the in-app reporter puts on an issue. `needs-triage` because a
 * report the server files is unreviewed by construction. `source: in-app`
 * because every issue is created with the maintainer's token: the label tells
 * a reader that the account and the author are not the same person.
 */
export function reportLabels(kind: "bug" | "feature"): string[] {
  return [
    kind === "bug" ? "type: bug" : "type: feature",
    "needs-triage",
    "source: in-app",
  ];
}
