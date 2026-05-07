FROM node:20-alpine

RUN apk add --no-cache python3

WORKDIR /app

COPY package*.json ./

RUN npm install

EXPOSE 3001

CMD ["npm", "run", "dev"]
