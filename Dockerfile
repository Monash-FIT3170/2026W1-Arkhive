# ---- Stage 1: build frontend ----
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build
# output: /app/frontend/dist

# ---- Stage 2: backend + serve frontend ----
FROM node:20
WORKDIR /app/backend

# Install backend deps
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend/ .

# Copy built frontend into backend/public
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 3000

CMD ["npx", "tsx", "app.ts"]