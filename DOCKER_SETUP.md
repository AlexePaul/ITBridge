# ITBridge Development Setup

## Local Development (without Docker)

### Prerequisites

- Node.js 22+
- PostgreSQL 17+

### Setup

1. Install dependencies:

   ```bash
   cd it-bridge-backend
   npm install
   ```

2. Create `.env.local` in the root directory with your database credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Create PostgreSQL database:

   ```bash
   psql -U postgres -f DatabaseCreation.sql
   ```

4. Update connection in your TypeORM configuration with your local database URL.

5. Start the development server:
   ```bash
   cd it-bridge-backend
   npm run start:dev
   ```

The API will be available at `http://localhost:3000` and Swagger docs at `http://localhost:3000/api`

---

## Docker Development (Recommended for consistency)

### Prerequisites

- Docker and Docker Compose installed

### Quick Start

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Start all services:
   ```bash
   docker-compose up
   ```

This will:

- Start a PostgreSQL container for development
- Build and start the NestJS backend in watch mode (hot-reload)
- Make the API available at `http://localhost:3000`

### Useful Commands

**View logs:**

```bash
docker-compose logs -f backend
docker-compose logs -f postgres
```

**Rebuild after dependency changes:**

```bash
docker-compose build --no-cache backend
docker-compose up
```

**Stop services:**

```bash
docker-compose down
```

**Clean up everything (including data):**

```bash
docker-compose down -v
```

**Run tests in container:**

```bash
docker-compose exec backend npm run test
```

**Run linting in container:**

```bash
docker-compose exec backend npm run lint
```

---

## Production Deployment

> Production Docker setup is not included in this version. This setup is for development only. For production, create a separate Dockerfile stage and compose override when needed.

---

## Environment Variables

| Variable    | Default      | Description       |
| ----------- | ------------ | ----------------- |
| NODE_ENV    | development  | Environment mode  |
| PORT        | 3000         | Application port  |
| DB_HOST     | postgres     | Database host     |
| DB_PORT     | 5432         | Database port     |
| DB_USER     | itbridge     | Database user     |
| DB_PASSWORD | dev_password | Database password |
| DB_NAME     | itbridge_db  | Database name     |

---

## Architecture

### Dockerfile

- Minimalist, dev-only: runs NestJS in watch mode for hot-reload
- No production or multi-stage logic
- Alpine base for minimal footprint

### docker-compose.yml

- PostgreSQL 17 Alpine container for dev
- Hot-reload development with volume mount for `src` only
- No `dist` volume (prevents EBUSY errors)
- Health checks for service dependencies
- Isolated network for inter-container communication

---

## Troubleshooting

**Port already in use:**

```bash
# Change ports in docker-compose.yml or use different port
docker-compose up -p 8000:3000
```

**Database connection failed:**

```bash
# Wait for postgres to be ready
docker-compose down && docker-compose up
```

**Need to reset database:**

```bash
docker-compose down -v  # Remove volume
docker-compose up       # Recreates with fresh initialization
```

**Build cache issues:**

```bash
docker-compose build --no-cache backend
```
