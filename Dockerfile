FROM node:24-bookworm-slim

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV HOST=0.0.0.0
ENV PORT=4173

COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production

RUN npm run build

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
