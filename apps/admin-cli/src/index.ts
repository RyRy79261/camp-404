#!/usr/bin/env node
/**
 * Camp 404 admin CLI — for data ops, seeding, bulk imports.
 */
const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "seed":
      await seed();
      break;
    case "wipe-test-data":
      await wipeTestData();
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

function printHelp() {
  console.log(
    `camp404 — admin CLI

Usage:
  camp404 seed             Seed minimum viable camp data
  camp404 wipe-test-data   Remove all test- prefixed rows
  camp404 help             Show this help`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
