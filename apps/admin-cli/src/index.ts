#!/usr/bin/env node
/**
 * Camp 404 admin CLI — for data ops, seeding, bulk imports.
 */
import { createInviteCode } from "@camp404/db/invite-codes";
import { parseMintArgs } from "./parse-mint-args";

const [, , command, ...rest] = process.argv;

async function main() {
  switch (command) {
    case "seed":
      await seed();
      break;
    case "wipe-test-data":
      await wipeTestData();
      break;
    case "mint-invite":
      await mintInvite(rest);
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

async function seed() {
  console.log("TODO: seed minimum viable camp data (Phase 1).");
}

async function wipeTestData() {
  console.log(
    'TODO: wipe rows where email/name has a "test-" prefix (CI/Agent scope).',
  );
}

async function mintInvite(args: string[]) {
  let parsed: ReturnType<typeof parseMintArgs>;
  try {
    parsed = parseMintArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(
      "\nUsage: camp404 mint-invite --code CODE [--created-by UUID]" +
        " [--note 'Berlin crew'] [--max-uses 5] [--expires-at 2026-06-01]",
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
      },
      null,
      2,
    ),
  );
}

function printHelp() {
  console.log(
    `camp404 — admin CLI

Usage:
  camp404 seed                      Seed minimum viable camp data
  camp404 wipe-test-data            Remove all test- prefixed rows
  camp404 mint-invite --code CODE   Issue a new invite code
    [--created-by UUID]               (the inviting member's users.id)
    [--note 'free text']              (e.g. "Berlin crew", "Camp Lead VIP")
    [--max-uses N]                    (default: unlimited)
    [--expires-at YYYY-MM-DD]         (default: never)
  camp404 help                      Show this help`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
