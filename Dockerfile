# STAGE 1: Builder
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building frontend)
RUN npm ci

# Copy source code
COPY . .

# Run production build (compiles frontend assets and relocates to backend/public)
RUN npm run build

# STAGE 2: Runner
FROM node:22-slim AS runner

# Install Puppeteer/Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy backend files and compiled assets from builder
COPY --from=builder /app/backend ./backend

# Expose the application port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
