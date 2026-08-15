FROM node:22-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 8080

# EL COMANDO QUE REALMENTE ARRANCA TU SERVIDOR
CMD ["node", "server-baileys.cjs"]