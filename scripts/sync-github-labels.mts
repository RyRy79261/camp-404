// Creates or updates every label in GITHUB_LABELS on this repository. It never
// deletes a label: an old label may still be on issues.
//
// Run by .github/workflows/labels.yml when the taxonomy changes on main:
//   node --experimental-strip-types scripts/sync-github-labels.mts
// Needs GITHUB_REPOSITORY (owner/name) and GITHUB_TOKEN with issues: write.
// DRY_RUN=1 reads the labels and prints the changes without writing.

import {
  GITHUB_LABELS,
  type GithubLabel,
} from "../packages/core/src/github-labels.ts";

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === "1";
if (!repo || !token) {
  console.error("GITHUB_REPOSITORY and GITHUB_TOKEN must be set.");
  process.exit(1);
}

const api = `https://api.github.com/repos/${repo}/labels`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "camp-404-label-sync",
};

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} answered ${res.status}`);
  }
  return res;
}

/** Every label on the repository, keyed by lower-case name (GitHub's rule). */
async function currentLabels(): Promise<Map<string, GithubLabel>> {
  const labels = new Map<string, GithubLabel>();
  for (let page = 1; ; page += 1) {
    const res = await call(`${api}?per_page=100&page=${page}`);
    const batch = (await res.json()) as GithubLabel[];
    for (const label of batch) labels.set(label.name.toLowerCase(), label);
    if (batch.length < 100) return labels;
  }
}

const existing = await currentLabels();
let created = 0;
let updated = 0;
for (const label of GITHUB_LABELS) {
  const current = existing.get(label.name.toLowerCase());
  if (!current) {
    console.log(`create  ${label.name}`);
    created += 1;
    if (!dryRun) {
      await call(api, {
        method: "POST",
        body: JSON.stringify({
          name: label.name,
          color: label.color,
          description: label.description,
        }),
      });
    }
  } else if (
    current.name !== label.name ||
    current.color.toLowerCase() !== label.color ||
    (current.description ?? "") !== label.description
  ) {
    console.log(`update  ${label.name}`);
    updated += 1;
    if (!dryRun) {
      await call(`${api}/${encodeURIComponent(current.name)}`, {
        method: "PATCH",
        body: JSON.stringify({
          new_name: label.name,
          color: label.color,
          description: label.description,
        }),
      });
    }
  }
}
console.log(
  `${dryRun ? "Dry run: " : ""}${created} created, ${updated} updated, ${
    GITHUB_LABELS.length - created - updated
  } already right.`,
);
