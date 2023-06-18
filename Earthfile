VERSION 0.7

ARG --global DOCKERHUB_REPO=cyxou/firefly-iii-telegram-bot
ARG --global DOCKERHUB_USERNAME=cyxou
ARG --global DOCKERHUB_ACCESS_TOKEN
ARG --global GITHUB_TOKEN
ARG --global RELEASE_VERSION=latest

FROM node:20-bullseye

WORKDIR /home/node/app

build-and-release:
    BUILD --platform=linux/amd64 --platform=linux/arm +buildImage
    BUILD +release

validatePR:
    BUILD +runTests
    BUILD +buildDist
    # BUILD +checkIfTagExist

deps:
    COPY *.json .npmrc ./
    RUN npm install --omit=dev --omit=optional \
        && mv ./node_modules ./node_modules_prod \
        && npm install --omit=optional

    # Output these back in case npm install changes them.
    SAVE ARTIFACT package.json AS LOCAL ./package.json
    SAVE ARTIFACT package-lock.json AS LOCAL ./package-lock.json
    SAVE ARTIFACT node_modules /node_modules AS LOCAL ./node_modules
    SAVE ARTIFACT node_modules_prod /node_modules_prod

buildDist:
    COPY +deps/node_modules ./node_modules
    COPY *.json ./
    COPY --dir src ./

    RUN npm run build

    SAVE ARTIFACT dist /dist AS LOCAL ./dist

runTests:
    RUN echo "😞 No tests yet..."

buildImage:
    COPY +buildDist/dist ./dist
    COPY +deps/node_modules_prod ./node_modules

    CMD ["dist/index.js"]

    SAVE IMAGE --push $DOCKERHUB_REPO:$RELEASE_VERSION
    SAVE IMAGE --push $DOCKERHUB_REPO:latest

checkIfTagExist:
    FROM earthly/dind

    # We do explicit login here since earthly/dind image does not infer login from the host
    RUN docker login --username ${DOCKERHUB_USERNAME} \
        --password ${DOCKERHUB_ACCESS_TOKEN}

    IF docker manifest inspect ${DOCKERHUB_REPO}:${RELEASE_VERSION} > /dev/null
        RUN echo "👷 Docker image with tag ${RELEASE_VERSION} already exists! You should not override it. Please increment the app version number accordingly. Exiting..." \
            && exit 1
    END

release:
  ARG --required GITHUB_TOKEN
  ARG --required RELEASE_VERSION
  ENV OUT_BASE="./dist"
  ENV REPO="cyxou/firefly-iii-telegram-bot"

  COPY +buildDist/dist ./dist

  # Install gh-cli
  RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
      && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
      && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
      && apt-get update && apt-get install gh jq -y \
      && gh --version

  # Generate release notes
  RUN gh api -X POST "repos/${REPO}/releases/generate-notes" \
        -F commitish=${RELEASE_VERSION} \
        -F tag_name=${RELEASE_VERSION} \
      > tmp-release-notes.json

  # Gzip the bins
  RUN tar -czvf "firefly-iii-telegram-bot.tar.gz" ${OUT_BASE}

  # Create release
  RUN ls -al
  RUN jq -r .body tmp-release-notes.json > tmp-release-notes.md \
      && gh release create ${RELEASE_VERSION} \
        --repo ${REPO} \
        --title "$(jq -r .name tmp-release-notes.json)" \
        --notes-file tmp-release-notes.md \
        --verify-tag \
        --draft \
        "./firefly-iii-telegram-bot.tar.gz#firefly-iii-telegram-bot-dist"
