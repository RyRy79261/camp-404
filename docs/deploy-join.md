# Deploying the join site (join.camp-404.com)

The join site is `apps/join`: one public page that shows the camp's
published join page for the current burn year, read from the same database
as the console. Captains write it in the console at
**Camp settings → Join page**. It is its own Vercel project, so a change to
the console does not rebuild it, and a change to it does not rebuild the
console.

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
6. Do not deploy yet: set the variables first.

## 2. Environment variables

Set these for **Production** and **Preview** (names only; take the values
from the console's project):

| Name                    | What it is for                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | The database the page is read from. The join site only reads. A read-only Postgres role is enough, and is safer if you want to make one; the console's URL also works.                           |
| `BLOB_READ_WRITE_TOKEN` | The camp's Blob store, for the page's pictures. Easiest: **Storage → the camp's Blob store → Connect Project → this project**, which sets it. Without it the text shows and the pictures do not. |

Nothing else. The join site has no sign-in, so it needs none of the auth
variables.

Previews: the console's previews each get their own Neon branch. The join
site's previews read whatever `DATABASE_URL` says for Preview. Pointing it at
production is fine: the page is public anyway.

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
since its last deployment (`apps/join` and the packages it uses: `core`,
`db`, `types`, `ui`). The console's `apps/web/vercel.json` has the same line
for `@camp404/web`. With both, a push makes a preview only for the app it
changes, which matters with 100 preview deployments a day. Leave the
**Ignored Build Step** setting in the dashboard on its default ("Automatic"),
because `vercel.json` wins over it.

## 5. First deploy, and the order of deploys

The join page's table (`join_pages`) is created by the console's deploy: its
`vercel-build` runs the migrations. The join site does not run migrations.
So deploy the console first (merge the PR). Until the table exists, the join
site says the page didn't load, and still shows Sign up.

Then deploy the join site (**Deployments → Redeploy**, or push). Publish the
page from **Camp settings → Join page** and it shows on the next visit; the
join site reads the database on each visit, so nothing needs a rebuild.

## Next

The console will move from camp-404.com to `app.camp-404.com` in its own PR.
When it does, change `APP_URL` in `apps/join/lib/site.ts`, which is where the
join site's Sign up, Sign in, Privacy and Terms links point.
