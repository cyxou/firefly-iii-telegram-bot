VERSION 0.7

ARG --global GHCR_REPO=ghcr.io/cyxou/firefly-iii-telegram-bot
ARG --global GHCR_USERNAME
ARG --global GHCR_TOKEN
ARG --global RELEASE_VERSION=latest

FROM oven/bun:1

WORKDIR /app

# Multi-arch is amd64 + arm64: oven/bun publishes no arm/v7 (32-bit) images —
# Bun does not build for it. v1's bare `linux/arm` resolved to arm/v7 via
# node:20-bullseye; the Bun cutover therefore drops 32-bit ARM support.
build-and-release:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +buildImage --TAG_LATEST=true
    BUILD +release

build-and-push:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +buildImage

build-latest:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +buildImage --RELEASE_VERSION=latest

validatePR:
    BUILD +runTests
    BUILD +buildImage

deps:
    COPY package.json bun.lock .npmrc ./
    RUN bun install --production --frozen-lockfile \
        && mv ./node_modules ./node_modules_prod \
        && bun install --frozen-lockfile

    SAVE ARTIFACT package.json AS LOCAL ./package.json
    SAVE ARTIFACT bun.lock AS LOCAL ./bun.lock
    SAVE ARTIFACT node_modules /node_modules AS LOCAL ./node_modules
    SAVE ARTIFACT node_modules_prod /node_modules_prod AS LOCAL ./node_modules_prod

runTests:
    COPY +deps/node_modules ./node_modules
    COPY package.json bun.lock tsconfig.json vitest.config.ts eslint.config.js .npmrc ./
    COPY --dir src __tests__ locales scripts ./

    RUN bunx tsc --noEmit && bun run lint && bunx vitest run

# v2 runs TypeScript from source — no build/dist step exists (spec amendment 2).
# locales/ ships in the image: i18n resolves it relative to src/bot (src/bot/i18n.ts).
buildImage:
    ARG TAG_LATEST=false
    COPY +deps/node_modules_prod ./node_modules
    COPY package.json bun.lock ./
    COPY --dir src locales ./

    CMD ["bun", "run", "./src/main.ts"]

    SAVE IMAGE --push $GHCR_REPO:$RELEASE_VERSION
    IF [ "$TAG_LATEST" = "true" ]
        SAVE IMAGE --push $GHCR_REPO:latest
    END

checkIfTagExist:
    FROM earthly/dind

    RUN echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

    IF docker manifest inspect ${GHCR_REPO}:${RELEASE_VERSION} > /dev/null
        RUN echo "👷 Docker image with tag ${RELEASE_VERSION} already exists! You should not override it. Please increment the app version number accordingly. Exiting..." \
            && exit 1
    END

# Release = generated notes only; the GHCR image is the artifact (spec amendment 2).
release:
  ARG --required GHCR_TOKEN
  ARG --required RELEASE_VERSION
  ENV GITHUB_TOKEN=${GHCR_TOKEN}
  ENV REPO="cyxou/firefly-iii-telegram-bot"

  # Install gh-cli
  RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
      && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
      && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
      && apt-get update && apt-get install gh -y \
      && gh --version

  # Generate release notes
  RUN gh api -X POST "repos/${REPO}/releases/generate-notes" \
        -F commitish=${RELEASE_VERSION} \
        -F tag_name=${RELEASE_VERSION} \
      > tmp-release-notes.json

  # Create release
  # ponytail: bun -e one-liners instead of jq — jq 404s from the security pool (v1 hit this on bullseye)
  RUN bun -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("tmp-release-notes.json","utf8"));fs.writeFileSync("tmp-release-notes.md",j.body)' \
      && gh release create ${RELEASE_VERSION} \
        --repo ${REPO} \
        --title "$(bun -e 'const j=JSON.parse(require("fs").readFileSync("tmp-release-notes.json","utf8"));console.log(j.name)')" \
        --notes-file tmp-release-notes.md \
        --verify-tag
