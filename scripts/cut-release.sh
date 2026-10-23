#!/usr/bin/env bash
# Manual release: bump package.json (patch|minor), commit "chore(release):
# vX.Y.Z", tag master, push branch+tag, dispatch the Release workflow on the
# tag. Invoked by the Earthfile's +cut-release target (locally or from
# .github/workflows/tag.yml in CI). Major releases stay manual by design.
#
# DRY_RUN=true performs bump+commit+tag and rolls everything back — nothing
# is pushed, so it is a full local test of the release path.
#
# Env: BUMP (patch|minor, required), DRY_RUN (true|false), GH_TOKEN (needed
# only for the final dispatch; git push uses the checkout's credentials).
set -euo pipefail

: "${BUMP:?BUMP must be patch or minor}"
DRY_RUN=${DRY_RUN:-false}
GH_TOKEN=${GH_TOKEN:-}

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = master ] || { echo "ERROR: run on master (currently on $branch)" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "ERROR: working tree dirty — commit or stash first" >&2; exit 1; }

current=$(jq -r .version package.json)
[[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "ERROR: package.json version '$current' is not plain X.Y.Z" >&2; exit 1; }
IFS=. read -r major minor patch <<< "$current"
case "$BUMP" in
  patch) next="$major.$minor.$((patch + 1))" ;;
  minor) next="$major.$((minor + 1)).0" ;;
  *) echo "ERROR: unknown bump '$BUMP' (patch|minor; major is a manual release)" >&2; exit 1 ;;
esac
tag="v$next"

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "ERROR: tag $tag already exists on origin — not overwriting" >&2
  exit 1
fi

jq --arg v "$next" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
git add package.json
git -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m "chore(release): $tag"
git tag "$tag"
echo "---- release commit:"
git show --stat --oneline HEAD | head -5

if [ "$DRY_RUN" = true ]; then
  git reset --hard HEAD~1
  git tag -d "$tag"
  echo "DRY_RUN=true: rolled back; nothing pushed."
  exit 0
fi

git push origin HEAD:master "refs/tags/$tag"

if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: pushed $tag but no GH_TOKEN to dispatch release.yml." >&2
  echo "Dispatch manually: gh workflow run release.yml --ref $tag" >&2
  exit 1
fi
GH_TOKEN="$GH_TOKEN" gh workflow run release.yml --ref "$tag"
echo "Released $tag — Release workflow dispatched."
