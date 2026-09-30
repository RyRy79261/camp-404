# @camp404/types

Zod schemas and the TypeScript types they infer, shared by every package:
members, questionnaires, announcements, recipes, money, dues, tickets,
transport, power, team programs and more.

- **Exports:** everything from `@camp404/types`, plus
  `@camp404/types/desktop-keys` and `@camp404/types/desktop-preferences`.
- **Depends on:** nothing in the workspace.
- **Imported by:** any app or package.
- **Rule:** validate outside input at the boundary with these schemas. Money
  uses the `Currency` schema, which accepts `ZAR` only.

```bash
pnpm --filter @camp404/types test
```
