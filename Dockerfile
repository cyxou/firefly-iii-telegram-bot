FROM node:16-alpine

WORKDIR /home/node/app

COPY *.json .

RUN npm install
