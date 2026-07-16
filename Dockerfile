FROM node:22-slim

# Install Puppeteer/Chromium system dependencies (cached)
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

# Copy backend files directly (already built locally)
COPY backend ./backend

# Expose the application port
EXPOSE 3001

# Start the application
CMD ["node", "--experimental-sqlite", "backend/index.js"]
