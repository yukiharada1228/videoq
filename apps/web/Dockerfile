FROM node:24.13.0-alpine3.23 AS build

WORKDIR /workspace

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_USE_S3_STORAGE=true
ENV VITE_USE_S3_STORAGE=${VITE_USE_S3_STORAGE}
ARG VITE_MAX_VIDEO_UPLOAD_SIZE_MB=500
ENV VITE_MAX_VIDEO_UPLOAD_SIZE_MB=${VITE_MAX_VIDEO_UPLOAD_SIZE_MB}
ARG VITE_OPERATOR_NAME=""
ENV VITE_OPERATOR_NAME=${VITE_OPERATOR_NAME}
ARG VITE_OPERATOR_REPRESENTATIVE=""
ENV VITE_OPERATOR_REPRESENTATIVE=${VITE_OPERATOR_REPRESENTATIVE}
ARG VITE_OPERATOR_EMAIL=""
ENV VITE_OPERATOR_EMAIL=${VITE_OPERATOR_EMAIL}
ARG VITE_OPERATOR_ADDRESS=""
ENV VITE_OPERATOR_ADDRESS=${VITE_OPERATOR_ADDRESS}
ARG VITE_OPERATOR_PHONE=""
ENV VITE_OPERATOR_PHONE=${VITE_OPERATOR_PHONE}

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/trpc/package.json packages/trpc/package.json
RUN npm ci --workspace @videoq/web

COPY apps/web apps/web
COPY packages/trpc packages/trpc
RUN npm run build --workspace @videoq/web


FROM nginx:alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
