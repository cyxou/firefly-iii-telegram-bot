##################################################
FROM node:18-alpine3.16 AS deps

WORKDIR /home/node/app

COPY package*.json .npmrc ./
RUN npm install --omit=dev --omit=optional \
    && mv ./node_modules ./node_modules_prod \
    && npm install --omit=optional

##################################################
FROM deps AS build

WORKDIR /home/node/app

COPY . .
RUN npm run build

##################################################
FROM node:18-alpine3.16 AS prod-image

ENV NODE_ENV=production
WORKDIR /home/node/app

# Copiamos lo compilado
COPY --from=build /home/node/app/dist ./dist
COPY --from=build /home/node/app/node_modules_prod ./node_modules
COPY --from=build /home/node/app/package.json ./package.json

# REPARACIÓN DE LOCALES:
# El código busca en dist/src/locales, pero están en dist/locales.
# Creamos el directorio y movemos los archivos a la ruta esperada.
RUN mkdir -p dist/src/locales && cp dist/locales/*.y*ml dist/src/locales/ 2>/dev/null || true

ENTRYPOINT ["node", "dist/src/index.js"]