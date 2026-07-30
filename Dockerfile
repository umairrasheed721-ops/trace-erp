FROM node:22-slim

# 1. Install system dependencies (Cached by Docker layer)
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

# 2. Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production

WORKDIR /app

# 3. Copy dependency manifests & install (Cached unless package.json changes)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 4. Copy pre-built production backend & public bundle
COPY backend ./backend

EXPOSE 3001

CMD ["node", "--experimental-sqlite", "backend/index.js"]
