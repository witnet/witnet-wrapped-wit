FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile


FROM node:22.17-alpine AS runtime
WORKDIR /app
RUN corepack enable pnpm


COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/addresses.json ./
COPY --from=build /app/settings.json ./
COPY --from=build /app/artifacts ./artifacts
COPY --from=build /app/contracts ./contracts
COPY --from=build /app/src ./src

CMD ["node", "/app/src/bin/unwrapper.js"]
