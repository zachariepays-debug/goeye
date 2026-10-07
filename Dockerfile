FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV HOST=0.0.0.0
ENV PORT=4173

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
