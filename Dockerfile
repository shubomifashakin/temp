FROM node:24-slim AS builder

RUN apt-get update -y \
  && apt-get install -y openssl wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-slim

RUN apt-get update -y \
  && apt-get upgrade -y \
  && apt-get install -y openssl wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./ 

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node","dist/src/main.js"]