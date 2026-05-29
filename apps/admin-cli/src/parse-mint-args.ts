export interface MintInviteArgs {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  expiresAt: Date | null;
  assignedRank: "captain" | "member" | null;
  requiresApproval: boolean;
}

// Value-less boolean flags: present = true. Listed here so the parser knows
// not to swallow the following token as their value.
const BOOLEAN_FLAGS = new Set(["requires-approval"]);

export function parseMintArgs(args: string[]): MintInviteArgs {
  const opts: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags.add(key);
        continue;
      }
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      opts[key] = next;
      i++;
    }
  }
  if (!opts.code) throw new Error("--code is required");
  const rankRaw = opts["assigns-rank"] ?? null;
  if (rankRaw !== null && rankRaw !== "captain" && rankRaw !== "member") {
    throw new Error(
      `--assigns-rank must be 'captain' or 'member' (got '${rankRaw}')`,
    );
  }
  return {
    code: opts.code,
    createdByUserId: opts["created-by"] ?? null,
    note: opts.note ?? null,
    maxUses: opts["max-uses"] ? Number(opts["max-uses"]) : null,
    expiresAt: opts["expires-at"] ? new Date(opts["expires-at"]) : null,
    assignedRank: rankRaw,
    requiresApproval: flags.has("requires-approval"),
  };
}
