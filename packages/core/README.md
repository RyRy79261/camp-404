# @camp404/core

The camp's rules as plain functions: who may see and do what (access,
privacy classes, audience, team tools), money, dues, participation labels,
questionnaire logic, power sums and more. No database, no network, no React,
no `process.env`, no I/O, so every rule is tested on its own.

- **Exports:** one entry point, `@camp404/core` (`src/index.ts`). Its header
  comment lists what each module adds.
- **Depends on:** `@camp404/types` only.
- **Imported by:** any app or package. `@camp404/db`, `@camp404/auth`,
  `@camp404/ui` and the apps all use it.
- **Rule:** a "who may act" check lives here as one pure function that fails
  closed (`canSendToAudience`, `canApproveRecipe`, `canEditTeamProgram`,
  `canManageMoney`, …). Change the rule in its function, never at a call site.

```bash
pnpm --filter @camp404/core test
```
