FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm install -g corepack@latest && corepack pnpm install --frozen-lockfile && corepack pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
CMD ["node", "dist/index.js"]
