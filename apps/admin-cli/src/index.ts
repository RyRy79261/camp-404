#!/usr/bin/env node
/**
 * Camp 404 admin CLI — for data ops, seeding, bulk imports.
 */
import {
  createInviteCode,
  findUsableInviteCode,
  revokeInviteCode,
} from "@camp404/db/invite-codes";
import { findUserById } from "@camp404/db/burner-profile";
import { parseMintArgs } from "./parse-mint-args";
import { SCENARIOS, seedScenario, wipeSeededData, type Scenario } from "./seed";

const [, , command, ...rest] = process.argv;

async function main() {
  switch (command) {
    case "seed":
      await seed(rest);
      break;
    case "wipe-test-data":
      await wipeTestData();
      break;
    case "mint-invite":
      await mintInvite(rest);
      break;
    case "bootstrap-founder":
      await bootstrapFounder(rest);
      break;
    case "revoke-invite":
      await revokeInvite(rest);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

async function seed(args: string[]) {
  const flag = args.indexOf("--scenario");
  const scenario = flag >= 0 ? args[flag + 1] : "small-camp";
  if (!SCENARIOS.includes(scenario as Scenario)) {
    console.error(
      `Unknown scenario "${scenario}". Known: ${SCENARIOS.join(", ")}.`,
    );
    return process.exit(1);
  }
  try {
    for (const line of await seedScenario(scenario as Scenario)) {
      console.log(line);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return process.exit(1);
  }
}

async function wipeTestData() {
  try {
    console.log(await wipeSeededData());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return process.exit(1);
  }
}

async function mintInvite(args: string[]) {
  let parsed: ReturnType<typeof parseMintArgs>;
  try {
    parsed = parseMintArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(
      "\nUsage: camp404 mint-invite --code CODE --created-by UUID" +
        " [--note 'Berlin crew'] [--max-uses 5] [--expires-at 2026-06-01]" +
        " [--assigns-rank captain|member] [--requires-approval]",
    );
    return process.exit(1);
  }

  // Captain-gate: this CLI is a privileged operator tool (anyone with
  // DATABASE_URL can already do anything; this is defense in depth, not a
  // real auth boundary — the same check belongs on the eventual in-app
  // endpoint). The operator must name a real captain as `--created-by` so
  // every code has a verified inviter. Bootstrap-founder is the only path
  // that mints a code with no inviter (used once, before any captain exists).
  if (!parsed.createdByUserId) {
    console.error(
      "--created-by is required (must be a captain's users.id UUID).",
    );
    return process.exit(1);
  }
  const inviter = await findUserById(parsed.createdByUserId);
  if (!inviter) {
    console.error(
      `No user found with id ${parsed.createdByUserId}. Cannot mint.`,
    );
    return process.exit(1);
  }
  if (inviter.rank !== "captain") {
    console.error(
      `User ${inviter.id} has rank '${inviter.rank}'. Only captains may mint invite codes.`,
    );
    return process.exit(1);
  }

  const row = await createInviteCode(parsed);
  console.log(
    JSON.stringify(
      {
        code: row.code,
        createdByUserId: row.createdByUserId,
        note: row.note,
        maxUses: row.maxUses,
        expiresAt: row.expiresAt,
        assignedRank: row.assignedRank,
        requiresApproval: row.requiresApproval,
      },
      null,
      2,
    ),
  );
}

// The well-known founder code minted by `bootstrap-founder`. Single-use,
// pinned so a fresh database always knows the redemption value.
const FOUNDER_CODE = "meowzit";

/**
 * One-shot bootstrap for the first account: nobody can issue an invite to
 * the founder, so this command mints `meowzit` as a single-use code
 * tagged with the founder's email. The founder then redeems it through
 * the normal /signup flow, after which the code is in claimed state
 * (use_count = max_uses = 1) and unusable by anyone else.
 */
async function bootstrapFounder(args: string[]) {
  let email: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--email") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error("Missing value for --email");
        return process.exit(1);
      }
      email = next;
      i++;
    }
  }
  if (!email || !email.includes("@")) {
    console.error("Usage: camp404 bootstrap-founder --email you@example.com");
    return process.exit(1);
  }

  const existing = await findUsableInviteCode(FOUNDER_CODE);
  if (existing) {
    console.error(
      `'${FOUNDER_CODE}' already exists and is redeemable. Refusing to ` +
        `overwrite — revoke / consume it manually if you really meant to ` +
        `re-bootstrap.`,
    );
    return process.exit(1);
  }

  const row = await createInviteCode({
    code: FOUNDER_CODE,
    createdByUserId: null,
    note: `Founder bootstrap for ${email}`,
    maxUses: 1,
    expiresAt: null,
  });

  console.log(
    JSON.stringify(
      {
        code: row.code,
        maxUses: row.maxUses,
        useCount: row.useCount,
        note: row.note,
        createdAt: row.createdAt,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nNext: go to /signup, enter '${FOUNDER_CODE}', then complete Neon ` +
      `Auth signup with ${email}. The code consumes itself on redemption.`,
  );
}

/**
 * Revoke an invite code so nobody can join with it again. Members who already
 * joined keep their place. The in-app control for this comes with the invite
 * management screen; until then this is the way to close a leaked code,
 * including the root code the /setup wizard minted.
 */
async function revokeInvite(args: string[]) {
  const i = args.indexOf("--code");
  const code = i === -1 ? undefined : args[i + 1];
  if (!code || code.startsWith("--")) {
    console.error("Usage: camp404 revoke-invite --code CODE");
    return process.exit(1);
  }
  const revoked = await revokeInviteCode({ code, actorUserId: null });
  if (!revoked) {
    console.error(
      `No live invite code '${code}'. It does not exist, or it is already revoked.`,
    );
    return process.exit(1);
  }
  console.log(`Revoked '${code}'. Nobody can join with it now.`);
}

/**
 * Idempotent one-off: encrypt any plaintext government ID numbers left in
 * burner_profiles.responses into the users encrypted columns and strip them
 * from responses. Run once after deploying the encryption change. Safe to
 * re-run.
 */
function printHelp() {
  console.log(
    `camp404 — admin CLI

Usage:
  camp404 seed [--scenario small-camp]
                                    Fill an EMPTY database with a sample camp
                                    through the app's own writers: a founder,
                                    35 members in every standing, teams with
                                    leads, a sent questionnaire with answers,
                                    and payments. Refuses a database that has
                                    anyone in it, and VERCEL_ENV=production.
  camp404 wipe-test-data            Empty a database that holds only seeded
                                    people. Refuses if anyone real is there.
  camp404 mint-invite --code CODE   Issue a new invite code
    --created-by UUID                 (REQUIRED — must be a captain's users.id)
    [--note 'free text']              (e.g. "Berlin crew", "Camp Lead VIP")
    [--max-uses N]                    (default: unlimited)
    [--expires-at YYYY-MM-DD]         (default: never)
    [--assigns-rank captain|member]   (auto-promote redeemer; default: none)
    [--requires-approval]             (redeemer needs captain approval before
                                      access; default: pre-approved)
                                      Refuses unless --created-by is a captain.
  camp404 bootstrap-founder --email YOU@EXAMPLE.COM
                                    Mint the single-use '${FOUNDER_CODE}'
                                    founder invite. Redeem at /signup.
  camp404 revoke-invite --code CODE Stop anyone joining with CODE. Members who
                                    already joined keep their place.
  camp404 help                      Show this help`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
