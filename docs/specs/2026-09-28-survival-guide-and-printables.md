# Survival Guide (#250) and printable pages (#249): scope and order

Status: proposal, waiting for the owner. Nothing is built.

## Survival Guide (#250)

**Owner's decisions (2026-09-24):** it is called the **Survival Guide**
everywhere, and it is **its own app on its own subdomain**, a nicely designed
book to read, not a console window. Writing and editing stay in the main app.

**What exists:**

- A `documents` table (title, slug, category, team, markdown, version,
  author, published), read and written only through the Claude connector.
  No screen, no old versions kept (one `version` number, overwritten), no
  burn year, no "duty card" kind.
- `apps/join` shows how a separate subdomain app is set up (its own Vercel
  project, build only when it changed, its own smoke test in CI).
- The `manualGenerationPrompt` in `@camp404/ai-prompts`. The `manuals/generate`
  cron the issue mentions is gone (no cron jobs).
- **Sign-in does not cross subdomains today.** The session cookie is set
  for the host only (`packages/auth/src/config.ts` has no cross-subdomain
  cookie). Passkeys are already on the apex domain, so they would work.

**Proposed scope, in order:**

1. **Writing, in the main app.** A "Survival Guide" program for editors:
   chapters (a document per chapter), Markdown with a preview, Draft →
   Publish, every publish kept as a version you can open. Captains edit
   everything; a team's leads edit their team's chapters (one pure rule in
   `packages/core`). Audited when someone edits another person's chapter.
   New table `document_versions`; `documents` gains `cycle_reviewed` and
   `public`.
2. **Reading, in the new app** `apps/survival-guide` at
   `survivalguide.camp-404.com` (the apex is `camp-404.com`, with the dash;
   the owner once wrote `camp404.com`). Contents, chapters, search, readable
   on a phone, prints cleanly. It reads published chapters only. Its look is
   its own (a book), proposed as a layout before it is built.
3. **Duty cards**: a chapter kind with a fixed shape (sub-roles with
   headcount, ordered steps, hard rules in red, the lead's end-of-shift
   checklist, "ask" as a role, never a phone number), checked by Zod before
   publishing. Linked from shift types once shifts exist (#248).
4. **Retype the old content** (no names): drive-to-burn guide, dishwashing
   steps, kitchen and fridge rules, MOOP and bins, sleeping-area rules, the
   safety playbook outline. A captain pastes them into the editor; nothing is
   read from Notion.
5. **Later, optional:** photos and voice → a draft duty card via the manual
   prompt (starts at a click, like recipes; needs `ai_data_consent`).

## Printable pages (#249)

**Two PRs tonight already print**, each on its own:

- PR #298: `/print/power/refuel-sheet` (a blank refuelling log), grid and
  sharing sheets;
- PR #301: `/print/lounge` (day sheets and a blank whiteboard grid).

Both follow #249's proposal: a page outside the console, black on white,
PDF through the browser's print dialog, same permission gate as the screen,
first name + surname initial. So the pattern is settled; what is missing is
**one shared print shell** so every print looks the same.

**Order: build each print after its source exists.**

| #   | Print                                                                                               | Source                            | Ready?                                         |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| 1   | Shared print shell (A4, header line, no desktop, print button); move #298 and #301's prints onto it | #298, #301                        | after those merge                              |
| 2   | Recipe card, at a chosen plate count                                                                | recipes + verified plate counts   | yes, on main (kitchen layout approval applies) |
| 3   | Duty cards                                                                                          | Survival Guide step 3             | no                                             |
| 4   | Daily site sheet (A4 landscape), my shifts card, blank grid                                         | shifts (#248)                     | no                                             |
| 5   | Burn timeline, loading checklist per pack event                                                     | calendar (#247), inventory (#300) | no                                             |
| 6   | Shopping list (no prices), recipe book for the menu                                                 | #244, #245                        | no                                             |

Rules on every print: first names (surname initial only to tell two apart);
no phone, email, ID, bank or medical details; allergies as counts only ("1
anaphylaxis: see the kitchen lead").

## Recommended order across both

1. Merge tonight's PRs (#298 and #301 carry the first prints).
2. Print shell, then the recipe card.
3. Survival Guide writing (main app), then the reading app.
4. Duty cards (guide + prints together).
5. Shift prints once #248 exists; calendar prints once #247 exists.

## Questions for the owner

1. **Domain:** `survivalguide.camp-404.com` (with the dash, like the rest)?
   _Default: yes._
2. **Members only, or partly public?** Some chapters ("Before you come", the
   drive-to-burn guide) could be public; the rest members-only. Members-only
   chapters need the sign-in cookie shared across `camp-404.com` subdomains,
   which changes the cookie for the whole site (members may have to sign in
   once more). _Default: public chapters marked one by one; members-only
   chapters read in the new app with a shared cookie._
3. **Who writes:** captains for everything, a team's leads for their team's
   chapters? _Default: yes._
4. **PDF:** the browser's print dialog ("Save as PDF"), no PDF library?
   _Default: yes._
5. **Order:** print shell and recipe card first, then the Survival Guide?
   _Default: yes._
