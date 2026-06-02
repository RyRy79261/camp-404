// @camp404/core — pure, framework-agnostic business logic + validation.
//
// Dependency rule (see design/spec/impl/architecture.md §layering):
//   types ← core ← ui ← apps
// This package depends ONLY on @camp404/types. It MUST NOT import
// @camp404/db, next/*, server-only, React, read process.env, or perform any
// I/O. That is what keeps it testable without a DB or route harness and
// reusable by apps/web, apps/admin-cli, apps/mobile, packages/ui, and tests.
//
// Phase-3 extractions land here progressively (see architecture.md
// §hybrid-extraction). Landed so far:
//   - access/clearance: rankLevel, hasClearance, deriveViewerRank,
//     hasCampAccess, isApproved, nextGate (./access)
//   - family tree: buildTree, computeMatchIds, subtreeHasMatch,
//     descendantCountLabel (./family-tree) — all cycle-guarded (OD9)
//   - invites: generateInviteCode, isSyntacticallyValidCode, CODE_RULES_HINT
//     (./invites)
//   - text utils: initialsFrom (./text-utils)
//   - text redaction: redactPii, sanitizeReportText (./text-redaction)
//   - shake detector: createShakeDetector + ShakeSample/ShakeDetectorConfig
//     (./shake); the React hook + DOM permission helpers stay in apps/web
//   - id validation: validateIdNumber, IdValidationResult (./id-validation)
// Deliberately NOT here: isAuthorizedCron (needs node:crypto/Buffer — core has
// no @types/node by design so it stays runtime-neutral for ui/mobile) and
// rateLimit (module-level mutable state).
// Still to come: the questionnaire catalogue, promotion guards/state-machine,
// and the mcp consent helpers (blocked on deciding McpScope's type home).

export * from "./access";
export * from "./family-tree";
export * from "./invites";
export * from "./text-utils";
export * from "./text-redaction";
export * from "./shake";
export * from "./id-validation";
