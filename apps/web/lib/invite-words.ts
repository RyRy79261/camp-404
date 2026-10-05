// Invite-code generation + slug validation moved to @camp404/core (pure).
// Re-exported here so existing app call-sites are
// unchanged; import directly from @camp404/core in new code.
export {
  generateInviteCode,
  isSyntacticallyValidCode,
  normalizeInviteCode,
  CODE_RULES_HINT,
} from "@camp404/core";
