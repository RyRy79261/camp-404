# @camp404/auth

Camp 404's self-hosted sign-in, built on Better Auth: email and password,
passkeys, two-factor codes and Google, with its tables in our own database.
Adapted from the AfrikaBurn contributors app.

- **Exports:** `auth`, `createAuth` and `buildAuthOptions` from
  `@camp404/auth`; the pure env readers (`authMayServe`, `resolveOAuthProxy`,
  …) from `@camp404/auth/env`.
- **Depends on:** `@camp404/core`, `@camp404/db`.
- **Imported by:** `apps/web` only, on the server. The route handler is
  `apps/web/app/api/auth/[...path]/route.ts`; the browser client is built in
  `apps/web/lib/auth-client.ts`.

The sign-in rules (fail closed without `BETTER_AUTH_SECRET`, passkeys bound to
the domain, the OAuth proxy for previews, no passkey or two-factor before the
email is confirmed) are in [`AGENTS.md`](../../AGENTS.md) and drawn in
[`docs/architecture.md`](../../docs/architecture.md#sign-in).

```bash
pnpm --filter @camp404/auth test
```
