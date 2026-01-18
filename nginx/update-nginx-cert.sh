#!/bin/bash

# This script updates nginx to use Let's Encrypt certificate if it exists
# Run: docker exec itbridge_nginx /update-nginx-cert.sh

DOMAIN="itbridge.webhop.me"
CERT_DIR="/etc/nginx/certs"

if [ -d "$CERT_DIR/live/$DOMAIN" ]; then
    echo "Let's Encrypt certificate found. Updating nginx configuration..."
    
    # Create a temporary nginx config with Let's Encrypt certificates
    cat > /tmp/nginx-le.conf << 'EOF'
ssl_certificate /etc/nginx/certs/live/itbridge.webhop.me/fullchain.pem;
ssl_certificate_key /etc/nginx/certs/live/itbridge.webhop.me/privkey.pem;
EOF

    # Update the main nginx config
    sed -i "s|ssl_certificate /etc/nginx/certs/selfsigned.crt;|ssl_certificate /etc/nginx/certs/live/itbridge.webhop.me/fullchain.pem;|g" /etc/nginx/nginx.conf
    sed -i "s|ssl_certificate_key /etc/nginx/certs/selfsigned.key;|ssl_certificate_key /etc/nginx/certs/live/itbridge.webhop.me/privkey.pem;|g" /etc/nginx/nginx.conf
    
    # Reload nginx
    nginx -s reload
    echo "Nginx configuration updated and reloaded!"
else
    echo "Let's Encrypt certificate not found at $CERT_DIR/live/$DOMAIN"
    echo "Run: docker exec itbridge_nginx certbot certonly --webroot -d itbridge.webhop.me"
fi
