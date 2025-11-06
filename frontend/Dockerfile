FROM node:22.11.0-slim AS base

WORKDIR /var/www/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./
RUN npm run build

FROM node:22.11.0-slim AS release

WORKDIR /var/www/app

COPY --from=base /var/www/app/.next/standalone ./
COPY --from=base /var/www/app/.next/static ./.next/static
COPY --from=base /var/www/app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]