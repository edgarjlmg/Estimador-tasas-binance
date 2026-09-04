FROM node:20-alpine
WORKDIR /app

COPY worker/package*.json ./
RUN npm install --omit=dev

COPY worker/src/ ./src/

ENV NODE_ENV=production

CMD ["node", "src/runner.js"]
