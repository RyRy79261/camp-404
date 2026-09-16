// Commit message rules (owner's call, 2026-09-16: add commitlint, with wide
// rules that match the real history). Conventional Commits:
//
//   type(scope): subject
//
// - type: from the list below, taken from this repo's history (`design` is
//   ours: Pencil and design-spec work).
// - scope: optional, lower-case kebab-case, several joined by commas
//   (`fix(web,db): ...`). There is no closed list of scopes: a new feature
//   area gets a new scope, and a fixed list would reject normal work.
// - header: 120 characters at most. Recent subjects run to 119; the rule is
//   there to stop a paragraph in the subject line, not to shorten them.
// - body and footer lines are not limited, so links and Dependabot's release
//   notes pass.
//
// Merge commits are ignored by commitlint's defaults.

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "test",
        "chore",
        "refactor",
        "design",
        "perf",
        "build",
        "ci",
        "style",
        "revert",
      ],
    ],
    "scope-case": [2, "always", "kebab-case"],
    "header-max-length": [2, "always", 120],
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
