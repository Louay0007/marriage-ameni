FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json eslint.config.js ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci --ignore-scripts
COPY client client
COPY server server
COPY shared shared
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV NODE_ENV=production PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/server/src/db/migrations server/dist/db/migrations
EXPOSE 3000
CMD ["sh", "-c", "node server/dist/db/migrate.js && node server/dist/index.js"]