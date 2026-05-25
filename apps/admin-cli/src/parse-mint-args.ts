export interface MintInviteArgs {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  expiresAt: Date | null;
}

export function parseMintArgs(args: string[]): MintInviteArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      opts[key] = next;
      i++;
    }
  }
  if (!opts.code) throw new Error("--code is required");
  return {
    code: opts.code,
    createdByUserId: opts["created-by"] ?? null,
    note: opts.note ?? null,
    maxUses: opts["max-uses"] ? Number(opts["max-uses"]) : null,
    expiresAt: opts["expires-at"] ? new Date(opts["expires-at"]) : null,
  };
}
