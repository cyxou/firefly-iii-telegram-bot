#!/usr/bin/env bash
# Auto-tag: a Release PR (branch release/vX.Y.Z) just merged — tag master HEAD
# with the version it bumped, push the tag and dispatch Publish on it. The
# dispatch is explicit because a GITHUB_TOKEN tag push does not fire on:push
# workflows (recursion guard). Invoked by the Earthfile's +tag-on-merge target
# (locally or from .github/workflows/tag-on-merge.yml in CI). Skips if the tag
# already exists, so re-runs and duplicate events are safe.
#
# DRY_RUN=true prints what it would do — no tag is created, nothing pushed,
# nothing dispatched.
#
# Env: DRY_RUN (true|false), GH_TOKEN (needed only for the dispatch; git push
# uses the checkout's credentials).
set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
GH_TOKEN=${GH_TOKEN:-}

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = master ] || { echo "ERROR: run on master (currently on $branch)" >&2; exit 1; }

tag="v$(jq -r .version package.json)"

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "$tag already tagged — nothing to do."
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo "DRY_RUN=true: would tag $tag on $(git rev-parse --short HEAD), push it and dispatch Publish."
  exit 0
fi

git tag "$tag"
git push origin "refs/tags/$tag"

if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: pushed $tag but no GH_TOKEN to dispatch publish.yml." >&2
  echo "Dispatch manually: gh workflow run publish.yml --ref $tag" >&2
  exit 1
fi
GH_TOKEN="$GH_TOKEN" gh workflow run publish.yml --ref "$tag"
echo "Tagged $tag and dispatched Publish."
