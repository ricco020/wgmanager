# syntax=docker/dockerfile:1.7
FROM node:22-alpine
WORKDIR /srv
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
# Public URL is inlined by next build (NEXT_PUBLIC_*): Railway passes service variables as build args.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NODE_ENV=production
RUN npm run build
EXPOSE 3000
# "prisma db push" at startup keeps the schema in sync without a migration pipeline (v1).
CMD ["npm", "run", "start"]
