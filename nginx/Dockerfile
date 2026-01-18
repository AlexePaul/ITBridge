FROM nginx:alpine

# Install certbot and necessary packages
RUN apk add --no-cache certbot certbot-nginx bash openssl curl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy initialization and update scripts
COPY init-letsencrypt.sh /init-letsencrypt.sh
COPY update-nginx-cert.sh /update-nginx-cert.sh
RUN chmod +x /init-letsencrypt.sh /update-nginx-cert.sh

# Create directories for certificates
RUN mkdir -p /etc/nginx/certs && \
    mkdir -p /var/www/certbot

# Create entrypoint script
RUN printf '#!/bin/sh\nset -e\n/init-letsencrypt.sh\nexec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Expose ports
EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
