# Immagine di produzione: il backend serve API, WebSocket e frontend compilato sulla stessa porta.
# L'HTTPS lo fa la piattaforma davanti (TLS_TERMINATED_BY_PROXY=true): vedi docs/deployment.md.

FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
USER node
EXPOSE 3000
CMD ["node", "server.js"]
