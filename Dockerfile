# CrownyCore — 에어갭 Docker 패키지
# foundry + foundry-gui만 포함 (2MB)
FROM node:20-alpine

WORKDIR /app

# CrownyCore 엔진 + GUI만 복사
COPY foundry/engine/ ./foundry/engine/
COPY foundry-gui/ ./foundry-gui/
RUN mkdir -p data/foundry data/audit data/backups

ENV FOUNDRY_PORT=7731
ENV CROWNY_AUTH=login
ENV NODE_ENV=production
EXPOSE 7731
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:7731/api/foundry/stats || exit 1
CMD ["node", "foundry-gui/server-foundry.js"]

# 기존 CrownyOS 앱 (아래는 유지)
# Copy application files
COPY server.js package.json ./
COPY chain/ ./chain/
COPY public/ ./public/
COPY chat-server/ ./chat-server/

# Create data directory
RUN mkdir -p data logs

# Non-root user for security
RUN addgroup -S crowny && adduser -S crowny -G crowny
RUN chown -R crowny:crowny /app
USER crowny

EXPOSE 7730

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:7730/api/health || exit 1

CMD ["node", "server.js"]
