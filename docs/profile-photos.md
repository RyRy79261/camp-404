# Profile Photos

> How a burner's optional profile photo is captured, stored, and shown.
> Photos are stored in a **private** Vercel Blob store and surfaced — to
> signed-in members only, via a gated proxy route — as a large circular
> avatar on the profile page and a small one in the home header.

## Goal

Let members add a profile photo so the camp can put a face to a name. It is
**always optional** — the onboarding step can be skipped, and the photo can
be added or changed later from the profile editor.

## Flow

1. **Onboarding.** The burner-profile questionnaire (`apps/web/lib/questionnaire.ts`)
   opens with a full-screen `profile_photo` page backed by the `image`
   question kind. When no photo is chosen the wizard's primary button reads
   **Skip** instead of **Next** (see `components/questionnaire/wizard.tsx`),
   so moving on without a photo is explicit.
2. **Upload.** `components/profile/avatar-upload.tsx` is a large circular
   control. On file select it centre-crops + downscales to a 512px square
   WebP in the browser (`lib/image.ts`, canvas — no extra dependency) and
   POSTs the result to `/api/uploads/avatar`.
3. **Storage.** `app/api/uploads/avatar/route.ts` authenticates the user,
   rate-limits per-user and per-IP (`lib/rate-limit.ts`), validates the
   image (`image/*`, ≤ 5 MB), and writes it to the **private** Vercel Blob
   store under `avatars/<userId>/…` with `access: "private"`. The raw blob
   URL isn't readable without the store token, so the route returns a
   same-origin proxy URL — `{ url: "/api/avatar?pathname=…" }` — never the
   blob URL itself.
4. **Serving.** `app/api/avatar/route.ts` is the gated proxy. It requires an
   authenticated session, then streams the blob via `get(pathname, { access:
   "private" })`. A logged-out request gets a 401, so the `<img>` just fails
   to load — photos are visible to signed-in members only. Any signed-in
   member may view any member's avatar (header, profile, family tree, captain
   roster), so the gate is "are you logged in", not ownership. Responses are
   cached `private, immutable` (the pathname's random suffix changes on every
   new upload).
5. **Persistence.** The returned URL is stored on `users.profile_image_url`
   (migration `0008`). On the onboarding save action it is mirrored from the
   questionnaire response onto the column; the profile editor writes it
   directly. Keeping it on the identity row (not in `burner_profiles.responses`)
   makes it cheap to read from the header, profile page, and family tree.
6. **Display.** The `@camp404/ui` `Avatar` component renders the photo with
   an initials fallback. Because the stored value is an ordinary same-origin
   URL, every `<img src={profileImageUrl}>` works unchanged. Used on
   `/profile`, `/profile/edit`, and in the home header (which links to
   `/profile`).

## Profile pages

- **`/profile`** (`app/profile/page.tsx`) — large circular avatar, display
  name, rank badge, email, and an **Edit profile** link.
- **`/profile/edit`** (`app/profile/edit/`) — change the photo and display
  name. Submits to the `updateProfile` server action in
  `app/profile/actions.ts`, which writes via `setProfileImage` /
  `setDisplayName` (`lib/users.ts`) and redirects back to `/profile`.

Both pages gate on the same access checks as the rest of the app and bounce
to `/onboarding/questionnaire` if the burner profile isn't finished yet.

## Configuration

- `BLOB_READ_WRITE_TOKEN` — read/write token for a **private** Vercel Blob
  store (see `.env.example`). The store must be created with **private**
  access; a public store will reject the `access: "private"` upload. When the
  token is unset, or when `E2E_TEST_MODE=1`, the upload route skips the
  network call and returns a deterministic proxy URL, and the proxy route
  serves nothing, so local dev and E2E tests work without a configured store.

## Notes

- The avatar preview uses a plain `<img>` inside a rounded container rather
  than `next/image`. Since photos are served from the same-origin proxy
  (`/api/avatar`), switching to `next/image` later would not need any remote
  host allowlisting — though private, per-request-authenticated images don't
  benefit from `next/image`'s shared optimisation cache.
- The `image` question kind stores its value as the photo URL string, so it
  flows through the existing questionnaire validator and change-log diffing
  without special casing.
