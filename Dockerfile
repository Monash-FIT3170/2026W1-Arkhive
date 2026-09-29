# ---- Stage 1: build frontend ----
FROM node:22 AS frontend-build
WORKDIR /app/frontend
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build
# output: /app/frontend/dist

# ---- Stage 2: backend + serve frontend ----
FROM node:22
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 3000
CMD ["npx", "tsx", "app.ts"]