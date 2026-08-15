FROM node:22-slim

RUN apt-get update && apt-get install -y \
    openssl \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 8080

<<<<<<< HEAD
CMD ["npx", "tsx", "src/index.ts"]
=======
CMD ["npm", "start"]
>>>>>>> 9982343a0714c4a282235e500e86481e4627361f
