FROM node:24.22.1-alpine AS base
RUN apk add --no-cache --upgrade ca-certificates && update-ca-certificates

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXO_LAB_DB_PATH=/app/data/nexo-lab.sqlite
ENV NEXO_LAB_BOOTSTRAP_EMAIL=jablasal@unizar.es

RUN mkdir -p /app/data
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
RUN chown -R node:node /app/data

USER node
EXPOSE 3000
CMD ["node", "server.js"]
