# Stage 1: Build React app with Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production Express server
FROM node:20-alpine
ENV TZ=Australia/Sydney
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY auth/ ./auth/
COPY db/ ./db/
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.js"]
