FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
ENV CLIENT_DIST=/app/client/dist
ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 8787
CMD ["node", "src/index.js"]
