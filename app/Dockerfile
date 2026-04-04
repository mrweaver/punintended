# Stage 1: Build React app with Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm install
COPY CHANGELOG.md /CHANGELOG.md
COPY app/ .
RUN npm run build

# Stage 2: Production Express server
FROM node:20-alpine
ENV TZ=Australia/Sydney
RUN apk add --no-cache tzdata
WORKDIR /app
COPY app/package*.json ./
RUN npm ci --omit=dev
COPY app/server.js ./
COPY app/auth/ ./auth/
COPY app/db/ ./db/
COPY app/lib/ ./lib/
COPY app/middleware/ ./middleware/
COPY app/routes/ ./routes/
COPY app/services/ ./services/
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.js"]
