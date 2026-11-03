# HitCore server – web app + API + SQLite database (no external dependencies)
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY index.html manifest.webmanifest sw.js ./
COPY css ./css
COPY js ./js
COPY icons ./icons
ENV NODE_ENV=production PORT=8080 HITCORE_DB=/data/hitcore.db
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
