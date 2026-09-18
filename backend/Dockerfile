# Production image for the Express API.
FROM node:20-alpine

WORKDIR /app

# Install deps first so this layer is cached unless package*.json changes.
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/index.js"]
