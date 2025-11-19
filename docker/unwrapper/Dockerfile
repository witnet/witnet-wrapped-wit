FROM node:24-bookworm AS base

RUN apt update && apt upgrade -y
RUN apt install build-essential;
RUN npm install -g pnpm
RUN npm install -g node-gyp

WORKDIR /app
COPY . /app

RUN pnpm install --frozen-lockfile

RUN chmod +x src/bin/unwrapper.js
RUN chmod +x src/bin/cli/index.cjs

CMD ["node", "/app/src/bin/unwrapper.js"] 
