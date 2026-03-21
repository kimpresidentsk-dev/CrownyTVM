FROM node:20-alpine

WORKDIR /app

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
