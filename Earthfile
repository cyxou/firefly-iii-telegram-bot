FROM node:16.9-alpine3.11
WORKDIR /home/node/app

deps:
    COPY *.json .npmrc ./
    RUN npm install --production \
        && mv ./node_modules ./node_modules_prod \
        && npm install
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
    ARG DOCKERHUB_REPO
    COPY +build/dist ./dist
    COPY +deps/node_modules_prod ./node_modules
    ENTRYPOINT ["node", "dist/index.js"]
    SAVE IMAGE --push $DOCKERHUB_REPO:latest
