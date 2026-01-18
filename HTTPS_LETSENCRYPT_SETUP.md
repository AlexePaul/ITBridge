# IT Bridge HTTPS/Let's Encrypt Configuration Guide

## Setup Instructions

### 1. Initial Setup (First Time)

Run the following command to start the services and initialize Let's Encrypt:

```bash
docker compose up -d --build
```

The nginx container will automatically:

- Check if a certificate exists for `itbridge.webhop.me`
- Request a certificate from Let's Encrypt if needed
- Generate a self-signed certificate as fallback if needed

### 2. Environment Variables

Add these to your `.env` file:

```env
# Let's Encrypt Email (for certificate notifications)
LETSENCRYPT_EMAIL=your-email@example.com
```

### 3. For Production (Port Forwarding)

Ensure your router has port forwarding configured:

- **External Port 80** → **Internal: nginx:80** (HTTP - for Let's Encrypt validation)
- **External Port 8990** → **Internal: nginx:443** (HTTPS - main access)

### 4. Testing Locally

For local testing, you can access:

- `https://localhost:8990` (self-signed certificate - ignore browser warning)
- `http://localhost` (redirects to HTTPS)

### 5. Certificate Renewal

Certificates are automatically renewed by a cron job that runs daily at 2 AM. The renewal happens in the background without downtime.

### 6. Manual Certificate Renewal

If you need to renew manually:

```bash
docker exec itbridge_nginx certbot renew --force-renewal
docker exec itbridge_nginx nginx -s reload
```

### 7. Certificate Status

Check certificate expiration:

```bash
docker exec itbridge_nginx certbot certificates
```

### 8. Troubleshooting

**Certificate validation fails:**

- Ensure ports 80 and 8990 are accessible from the internet
- Check that domain `itbridge.webhop.me` points to your IP
- Check nginx logs: `docker logs itbridge_nginx`

**Self-signed certificate appearing:**

- Check Let's Encrypt logs: `docker exec itbridge_nginx cat /var/log/letsencrypt/letsencrypt.log`
- Ensure email is correct in `.env`

**Need to reset certificates:**

```bash
docker exec itbridge_nginx certbot delete --domain itbridge.webhop.me --non-interactive
docker compose restart nginx
```

## Architecture

- **Nginx** acts as a reverse proxy and SSL terminator
- **Certbot** handles Let's Encrypt certificate provisioning
- **Backend** runs on HTTP internally, HTTPS handled by Nginx
- **Certificate storage** persists in `./certs` volume for reuse
