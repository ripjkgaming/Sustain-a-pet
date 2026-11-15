# Single production image: one Node server serves the built SPA (dist/) and /api/eco-quest.
# Build:  docker build -t sustain-a-pet .
# Run:    docker run -p 8080:8080 -e OPENROUTER_API_KEY=... -e QUEST_SIGNING_SECRET=... sustain-a-pet

# Stage 1: build the SPA
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime. The server has no npm dependencies, so no node_modules are installed.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node api ./api
COPY --chown=node:node src ./src
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/healthz || exit 1
# `node` as PID 1 receives SIGTERM directly and shuts down gracefully.
CMD ["node", "server/index.js"]
