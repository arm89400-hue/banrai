# Build stage: compile the Vite app into static assets.
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Baked into the JS bundle at build time (Vite env vars are static, not
# read at container runtime) - override with --build-arg if the API lives
# somewhere other than http://localhost:4000 from the browser's point of view.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# Serve stage: static assets behind nginx, with SPA fallback so client-side
# routes (e.g. /booking) work on a hard refresh instead of 404ing.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
