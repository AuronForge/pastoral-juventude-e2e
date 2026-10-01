FROM node:24.8.0-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY playwright.config.ts tsconfig.json ./
COPY tests ./tests
ENV CI=true
CMD ["npm", "run", "test:e2e"]
