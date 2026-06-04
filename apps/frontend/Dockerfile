FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

EXPOSE 5173

# --host: 컨테이너 외부(브라우저)에서 접근 가능하도록 0.0.0.0 바인딩
CMD ["npm", "run", "dev", "--", "--host"]
