VERSION 0.6

FROM node:16.9-alpine3.11
WORKDIR /home/node/app

COPY package.json .
RUN node -e "console.log(require('./package.json').version)" > ./version.txt
ARG VERSION=$(cat ./version.txt)

all:
    BUILD \
        --platform=linux/amd64 \
        --platform=linux/arm \
        +image

deps:
    COPY *.json .npmrc ./
    RUN npm install --production \
        && mv ./node_modules ./node_modules_prod \
        && npm install --no-optional

    # Output these back in case npm install changes them.
    SAVE ARTIFACT package.json AS LOCAL ./package.json
    SAVE ARTIFACT package-lock.json AS LOCAL ./package-lock.json
    SAVE ARTIFACT node_modules /node_modules AS LOCAL ./node_modules
    SAVE ARTIFACT node_modules_prod /node_modules_prod

build:
    COPY +deps/node_modules ./node_modules
    COPY *.json ./
    COPY --dir src ./

    RUN npm run build

    SAVE ARTIFACT dist /dist AS LOCAL ./dist

image:
    ARG DOCKERHUB_REPO=cyxou/firefly-iii-telegram-bot
    ARG TAG=$VERSION

    COPY +build/dist ./dist
    COPY +deps/node_modules_prod ./node_modules

    ENTRYPOINT ["node", "dist/index.js"]

    SAVE IMAGE --push $DOCKERHUB_REPO:$TAG
    SAVE IMAGE --push $DOCKERHUB_REPO:latest
