// @camp404/core — pure, framework-agnostic business logic + validation.
//
// Dependency rule (see design/spec/impl/architecture.md §layering):
//   types ← core ← ui ← apps
// This package depends ONLY on @camp404/types. It MUST NOT import
// @camp404/db, next/*, server-only, React, read process.env, or perform any
// I/O. That is what keeps it testable without a DB or route harness and
// reusable by apps/web, apps/admin-cli, apps/mobile, packages/ui, and tests.
//
// Phase-1 scaffold. The pure-logic extractions land here in Phase 3 (see
// architecture.md §hybrid-extraction): access/clearance (hasCampAccess,
// isApproved, nextGate, rankLevel, deriveViewerRank, requireClearance),
// invites (generateInviteCode, isSyntacticallyValidCode), the questionnaire
// catalogue + validateIdNumber, promotion guards/state-machine, family-tree
// builders (+ cycle guards), mcp helpers, and platform utils.

/** Package marker — replaced by real exports as Phase-3 modules land. */
export const CORE_PACKAGE = "@camp404/core" as const;
