#!/usr/bin/env bash
# Vercel's Ignored Build Step for the apps in this monorepo. Each app's
# vercel.json runs it from the app's Root Directory:
#
#   "ignoreCommand": "bash ../../scripts/vercel-ignore-build.sh @camp404/web"
#
# Exit 0 tells Vercel to skip the build, any other exit lets it build. The
# decision is turbo-ignore's: the app builds when the app or any workspace
# package it depends on changed (turbo's package graph), so a docs-only push
# builds nothing and a web-only push skips join and guide.
#
# turbo-ignore compares against the last successful deployment of this
# project on this branch (VERCEL_GIT_PREVIOUS_SHA). This script only picks
# the fallback for when there is none, or Vercel's clone is too shallow to
# hold it:
#   - main: HEAD^1. Every commit on main is one merged PR, so the parent is
#     exactly what the merge changed.
#   - any other branch: the merge base with main, so a branch's first push
#     is judged on all of its commits, not only the last one (HEAD^1 would
#     skip an app changed two commits back, and keep skipping it).
#   - no merge base found: no fallback, and turbo-ignore builds.
# Anything that goes wrong ends in a build, never in a wrongly skipped one.
set -uo pipefail
# A failed fetch must fail, not wait at a username prompt.
export GIT_TERMINAL_PROMPT=0

pkg="${1:?usage: vercel-ignore-build.sh <workspace name>}"
production_branch="main"
repo_url="https://github.com/${VERCEL_GIT_REPO_OWNER:-RyRy79261}/${VERCEL_GIT_REPO_SLUG:-camp-404}.git"
log() { echo "[vercel-ignore-build] $*"; }

# Vercel clones 10 commits deep. Deepen this commit to 100 (so an older
# previous deployment is still reachable) and fetch main for the merge base.
# The repository is public, so this needs no credentials.
head_sha="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
if ! git fetch --quiet --no-tags --depth=100 "$repo_url" \
  "$head_sha" "+refs/heads/$production_branch:refs/remotes/ignore-step/$production_branch"; then
  log "could not fetch history from $repo_url; comparing with what the clone has"
fi

fallback=""
if [[ "${VERCEL_GIT_COMMIT_REF:-}" == "$production_branch" ]]; then
  fallback="HEAD^1"
elif base="$(git merge-base HEAD "refs/remotes/ignore-step/$production_branch" 2>/dev/null)"; then
  fallback="$base"
else
  log "no merge base with $production_branch; building"
fi
[[ -n "$fallback" ]] && log "fallback when there is no previous deployment: $fallback"

# Pinned: npx would otherwise fetch whatever turbo-ignore is newest.
npx -y turbo-ignore@2.11.7 "$pkg" ${fallback:+"--fallback=$fallback"}
status=$?
if [[ $status -eq 0 ]]; then
  exit 0
fi
exit 1
