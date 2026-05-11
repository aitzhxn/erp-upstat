FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/data.db

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# initDb() reads schema from disk at runtime (not bundled by tsc)
COPY --from=builder /app/src/schema.sql ./src/schema.sql

RUN mkdir -p /app/data /app/src

EXPOSE 3001

CMD ["node", "dist/index.js"]
