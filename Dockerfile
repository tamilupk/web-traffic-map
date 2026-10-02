# Web Traffic Map - Docker Image
# Multi-stage build for smaller final image

# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev

# Production stage
FROM node:24-alpine

WORKDIR /app

# Runtime healthcheck utility (native dependencies are built in the builder)
RUN apk add --no-cache curl

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package*.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:30045/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
