FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build

# BEGIN managed npm
ARG NPM_VERSION=12.2.1
ARG NPM_URL=https://registry.npmjs.org/npm/-/npm-12.2.1.tgz
ARG NPM_INTEGRITY=sha512-bKCmFRVT/BB+YPEYbZwQ1XUI3N5t4xKSpU1MxOjo7z3iWzKBJ0ZXRC1xFdEN+TC7N5TdywaBzf2dMXGJq/e2PQ==
RUN node --input-type=module -e 'import {createHash} from "node:crypto"; import {writeFileSync} from "node:fs"; const r=await fetch(process.env.NPM_URL); if(!r.ok) throw new Error("npm download failed"); const b=Buffer.from(await r.arrayBuffer()); if("sha512-"+createHash("sha512").update(b).digest("base64")!==process.env.NPM_INTEGRITY) throw new Error("npm integrity mismatch"); writeFileSync("/tmp/npm.tgz",b)' \
    && mkdir -p /opt/verified-npm \
    && tar -xzf /tmp/npm.tgz -C /opt/verified-npm --strip-components=1 \
    && ln -sf /opt/verified-npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /opt/verified-npm/bin/npx-cli.js /usr/local/bin/npx \
    && rm /tmp/npm.tgz \
    && test "$(npm --version)" = "$NPM_VERSION"
# END managed npm

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
RUN npm ci --ignore-scripts --workspace @videoq/web --workspace @videoq/api

COPY apps/web apps/web
COPY apps/api apps/api
COPY packages/trpc packages/trpc
RUN npm run build --workspace @videoq/web


FROM nginx:alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
