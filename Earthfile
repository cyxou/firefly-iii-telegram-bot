VERSION 0.6

ARG DOCKERHUB_REPO=cyxou/firefly-iii-telegram-bot
ARG DOCKERHUB_USERNAME=cyxou
ARG --required DOCKERHUB_ACCESS_TOKEN

FROM node:18-alpine3.16
WORKDIR /home/node/app

COPY package.json .
RUN node -e "console.log(require('./package.json').version)" > ./version.txt
ARG VERSION=$(cat ./version.txt)

multiplatformBuild:
    BUILD --platform=linux/amd64 --platform=linux/arm +buildImage

validatePR:
    BUILD +runTests
    BUILD +buildDist
    BUILD +checkIfTagExist

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
    ARG TAG=${VERSION}

    COPY +buildDist/dist ./dist
    COPY +deps/node_modules_prod ./node_modules

    ENTRYPOINT ["node", "dist/index.js"]

    SAVE IMAGE --push $DOCKERHUB_REPO:$TAG
    SAVE IMAGE --push $DOCKERHUB_REPO:latest

checkIfTagExist:
    FROM earthly/dind

    ARG TAG=${VERSION}

    # We do explicit login here since earthly/dind image does not infer login from the host
    RUN docker login --username ${DOCKERHUB_USERNAME} \
        --password ${DOCKERHUB_ACCESS_TOKEN}

    IF docker manifest inspect ${DOCKERHUB_REPO}:${TAG} > /dev/null
        RUN echo "👷 Docker image with tag ${VERSION} already exists! You should not override it. Please increment the app version number accordingly. Exiting..." \
            && exit 1
    END
