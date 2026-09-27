ARG NODE_IMAGE=node:22
FROM ${NODE_IMAGE} AS build
WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN node scripts/container-build.cjs && npm prune --omit=dev --no-audit --no-fund
RUN mkdir -p .tmp public/uploads database/migrations

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production STRAPI_TELEMETRY_DISABLED=true
WORKDIR /opt/app
COPY --from=build --chown=node:node /opt/app ./
RUN chown node:node /opt/app
USER node
CMD ["npm", "start"]
