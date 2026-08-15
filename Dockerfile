FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .
RUN ls -la /app

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 8080

CMD ["node", "server.js"]