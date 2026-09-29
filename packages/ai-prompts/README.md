# @camp404/ai-prompts

The prompt templates the app sends to Claude, each with a version:
recipe import, normalisation, plate counts, source proofreading and revision,
recipe adjustment, voice intent and manual generation.

- **Exports:** one function per prompt and `PROMPT_VERSIONS` from
  `@camp404/ai-prompts`.
- **Depends on:** `@camp404/types`.
- **Imported by:** `apps/web`.
- **Rule:** never edit a prompt in place. Change it and bump its version in
  `PROMPT_VERSIONS`, so a stored result says which prompt made it.

```bash
pnpm --filter @camp404/ai-prompts test
```
