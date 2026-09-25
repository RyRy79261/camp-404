# Deploying the join site (join.camp-404.com)

The join site is `apps/join`: one public page. For now it is a placeholder
(the heading, "The full page is coming soon." and links to Sign up and Sign
in); the real page is built in code from the owner's copy. It reads no
database and has no sign-in. It is its own Vercel project, so a change to the
console does not rebuild it, and a change to it does not rebuild the console.

These are the steps in Vercel. Nothing here is done by the code or by CI.

## 1. Create the project

1. In Vercel, **Add New → Project**, and import this repository again (the
   same repo the console's project uses).
2. **Project name:** anything, for example `camp-404-join`.
3. **Framework preset:** Next.js.
4. **Root Directory:** `apps/join`. Leave "Include files outside the root
   directory in the Build Step" on (the default): the app uses the shared
   packages.
5. Leave **Build Command**, **Output Directory** and **Install Command** empty.
   Vercel installs from the repository root with pnpm and runs `next build`.

## 2. Environment variables

None. The join site reads no database (no `DATABASE_URL`), stores no files
(no `BLOB_READ_WRITE_TOKEN`) and has no sign-in (none of the auth variables).
Its links to the console are fixed in `apps/join/lib/site.ts`.

## 3. Domain

1. In the new project, **Settings → Domains → Add**: `join.camp-404.com`.
2. Add the DNS record Vercel shows (a `CNAME` to `cname.vercel-dns.com`)
   where camp-404.com's DNS is managed. If the domain already uses Vercel's
   nameservers, Vercel adds it for you.

## 4. Ignored Build Step

`apps/join/vercel.json` sets it already:

```json
"ignoreCommand": "npx turbo-ignore@2.11.4 @camp404/join"
```

`turbo-ignore` skips the build when nothing the join site depends on changed
since its last deployment (`apps/join` and the packages it uses: `ui`, and
`core` and `types` through it). The console's `apps/web/vercel.json` has the same line
for `@camp404/web`. With both, a push makes a preview only for the app it
changes, which matters with 100 preview deployments a day. Leave the
**Ignored Build Step** setting in the dashboard on its default ("Automatic"),
because `vercel.json` wins over it.

## 5. First deploy

Deploy (**Deployments → Redeploy**, or push). The join site does not depend on
the console's deploy: it has no table and runs no migrations, so either can go
first.

## Next

The console will move from camp-404.com to `app.camp-404.com` in its own PR.
When it does, change `APP_URL` in `apps/join/lib/site.ts`, which is where the
join site's Sign up and Sign in links point.
