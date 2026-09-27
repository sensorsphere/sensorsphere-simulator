FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

RUN date -u +%Y-%m-%dT%H:%M:%SZ > /app/build-date.txt \
    && mkdir -p /app/data

EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=12 \
  CMD wget -qO- http://127.0.0.1:8090/api/state >/dev/null || exit 1

CMD ["npm", "start"]
