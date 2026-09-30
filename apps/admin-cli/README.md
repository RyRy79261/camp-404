# @camp404/admin-cli

A Node CLI for data work on a local stack or a throwaway Neon branch:
seeding a sample camp and managing invite codes.

```bash
pnpm --filter @camp404/admin-cli dev help
pnpm --filter @camp404/admin-cli dev seed --scenario small-camp
pnpm --filter @camp404/admin-cli dev wipe-test-data
pnpm --filter @camp404/admin-cli dev mint-invite --code CODE --created-by <captain uuid>
pnpm --filter @camp404/admin-cli dev revoke-invite ...
pnpm --filter @camp404/admin-cli dev bootstrap-founder ...
```

It reads `DATABASE_URL` and imports `@camp404/db` and `@camp404/types`.
`seed` and `wipe-test-data` refuse to run when `VERCEL_ENV` is `production`.

**Never use it to change production.** A one-off data fix is a custom
migration that runs on the next deploy (see
[`AGENTS.md`](../../AGENTS.md#database--read-this-before-touching-the-schema)).
The first captain founds the camp through the in-app setup page (`/setup`).

```bash
pnpm --filter @camp404/admin-cli test
```
