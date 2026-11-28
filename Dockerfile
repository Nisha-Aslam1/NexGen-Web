# ----------------------------------------------------
# Stage 1: Build Frontend and Server
# ----------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm install

# Copy full application source code
COPY . .

# Build Vite client and bundle server into dist/server.cjs
RUN npm run build

# ----------------------------------------------------
# Stage 2: Production Runtime
# ----------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose standard web port
EXPOSE 3000

# Start compiled CommonJS server with ESBuild bundle
CMD ["node", "dist/server.cjs"]
