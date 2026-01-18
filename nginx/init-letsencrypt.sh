#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DOMAIN="itbridge.webhop.me"
CERT_DIR="/etc/nginx/certs"
CERTBOT_DIR="/var/www/certbot"
EMAIL="${LETSENCRYPT_EMAIL:-alexepaul2011@gmail.com}"
ENV="${NODE_ENV:-development}"

echo -e "${YELLOW}Starting Let's Encrypt certificate setup...${NC}"
echo -e "${YELLOW}Environment: $ENV${NC}"

# Create necessary directories
mkdir -p "$CERT_DIR"
mkdir -p "$CERTBOT_DIR"

# Check if certificate already exists
if [ -d "$CERT_DIR/live/$DOMAIN" ]; then
    echo -e "${GREEN}Certificate for $DOMAIN already exists.${NC}"
else
    if [ "$ENV" = "production" ]; then
        echo -e "${YELLOW}Production mode: Requesting certificate from Let's Encrypt for $DOMAIN...${NC}"
        
        certbot certonly \
            --webroot \
            --webroot-path "$CERTBOT_DIR" \
            -d "$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos \
            --non-interactive \
            --quiet
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Certificate obtained successfully!${NC}"
        else
            echo -e "${RED}Failed to obtain certificate from Let's Encrypt!${NC}"
            echo -e "${RED}Make sure:${NC}"
            echo -e "${RED}  1. Domain $DOMAIN points to this server${NC}"
            echo -e "${RED}  2. Ports 80 and 8990 are accessible from the internet${NC}"
            echo -e "${RED}  3. Email ($EMAIL) is correct${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Development mode: Generating self-signed certificate for $DOMAIN...${NC}"
        
        # Generate self-signed certificate for local development
        mkdir -p "$CERT_DIR/live/$DOMAIN"
        openssl req -x509 -newkey rsa:2048 \
            -keyout "$CERT_DIR/live/$DOMAIN/privkey.pem" \
            -out "$CERT_DIR/live/$DOMAIN/fullchain.pem" \
            -days 365 -nodes \
            -subj "/CN=$DOMAIN"
        
        echo -e "${YELLOW}Self-signed certificate created for local development${NC}"
        echo -e "${YELLOW}Note: You'll see SSL warnings in your browser - this is normal for local development${NC}"
    fi
fi

echo -e "${GREEN}Certificate setup complete!${NC}"
