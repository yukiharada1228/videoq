FROM node:24.13.0-alpine3.23 AS build

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_MAX_VIDEO_UPLOAD_SIZE_MB=500
ENV VITE_MAX_VIDEO_UPLOAD_SIZE_MB=${VITE_MAX_VIDEO_UPLOAD_SIZE_MB}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
