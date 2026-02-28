FROM node:24-slim

RUN apt-get update -y && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npx prisma generate
RUN npm run build

USER node 

EXPOSE 3000

CMD ["node","dist/src/main.js"]