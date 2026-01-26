# Web Traffic Map - Docker Image
# Multi-stage build for smaller final image

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install required build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package*.json ./
COPY src ./src
COPY public ./public

# Rebuild better-sqlite3 for Alpine
RUN npm rebuild better-sqlite3

# Create directories for data and logs
RUN mkdir -p /data /logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=30045
ENV DB_PATH=/data/traffic.db
ENV LOG_DIR=/logs

# Expose port
EXPOSE 30045

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:30045/api/status || exit 1

# Start the application
CMD ["node", "src/index.js"]
