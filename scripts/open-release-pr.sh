#!/usr/bin/env bash
# Manual bump: bump package.json (patch|minor), push branch release/vX.Y.Z,
# open a PR. Merging the PR is what cuts the release — tag-on-merge.yml tags
# master and dispatches Publish on the tag. Invoked by the Earthfile's
# +open-release-pr target (locally or from .github/workflows/release-pr.yml
# in CI). Major releases stay manual by design.
#
# DRY_RUN=true performs branch+bump+commit and rolls everything back — nothing
# is pushed, so it is a full local test of the release path.
#
# Env: BUMP (patch|minor, required), DRY_RUN (true|false), GH_TOKEN (needed
# only to open the PR; git push uses the checkout's credentials).
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
relbranch="release/$tag"

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "ERROR: tag $tag already exists on origin — not overwriting" >&2
  exit 1
fi
if git ls-remote --exit-code --heads origin "refs/heads/$relbranch" >/dev/null 2>&1; then
  echo "ERROR: branch $relbranch already exists on origin — close its PR or delete the branch first" >&2
  exit 1
fi

git checkout -b "$relbranch"
jq --arg v "$next" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
git add package.json
git -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m "chore(release): $tag"
echo "---- release commit:"
git show --stat --oneline HEAD | head -5

if [ "$DRY_RUN" = true ]; then
  git checkout master
  git branch -D "$relbranch"
  echo "DRY_RUN=true: rolled back; nothing pushed."
  exit 0
fi

git push origin "$relbranch"

if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: pushed $relbranch but no GH_TOKEN to open the PR." >&2
  echo "Open manually: gh pr create --head $relbranch --title 'chore(release): $tag'" >&2
  exit 1
fi
GH_TOKEN="$GH_TOKEN" gh pr create \
  --head "$relbranch" \
  --title "chore(release): $tag" \
  --body "Bump to \`$tag\`. **Merge = release**: tag-on-merge tags master, Publish ships the image, GitHub Release and the Telegram notice."
echo "Release PR opened for $tag."
