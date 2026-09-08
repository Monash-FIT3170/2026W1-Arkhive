# ---- Stage 1: build frontend ----
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build
# output: /app/frontend/dist

# ---- Stage 2: backend + serve frontend ----
FROM node:20
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 3000
CMD ["npx", "tsx", "app.ts"]