FROM node:22.12.0-alpine AS build

WORKDIR /app

# Build-time env for Vite (embedded into bundle)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:alpine AS runtime

# SPA routing (React Router) fallback + sensible caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
