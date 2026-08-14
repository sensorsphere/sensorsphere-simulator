FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 8090
CMD ["npm", "start"]
