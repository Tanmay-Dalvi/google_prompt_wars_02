# ============================================================
# VoteWise — Production Dockerfile
# Author: Tanmay Dalvi
# Base: nginx:alpine (minimal attack surface)
# ============================================================
FROM nginx:1.27-alpine AS production

LABEL maintainer="Tanmay Dalvi"
LABEL description="VoteWise - AI-powered election literacy assistant"
LABEL version="1.0.0"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy all static assets
COPY index.html      /usr/share/nginx/html/
COPY styles.css      /usr/share/nginx/html/
COPY app.js          /usr/share/nginx/html/
COPY config.js       /usr/share/nginx/html/
COPY security.js     /usr/share/nginx/html/
COPY translate.js    /usr/share/nginx/html/
COPY calendar.js     /usr/share/nginx/html/
COPY analytics.js    /usr/share/nginx/html/
COPY manifest.json   /usr/share/nginx/html/
COPY icons/          /usr/share/nginx/html/icons/
COPY nginx.conf      /etc/nginx/conf.d/default.conf

# Copy test folder (for reference, not served)
COPY tests/          /usr/share/nginx/html/tests/

# Set correct permissions and fix PID file for non-root execution
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    chmod -R 777 /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Move PID file to a writable location
RUN sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|g' /etc/nginx/nginx.conf

# Drop root — run as nginx user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
