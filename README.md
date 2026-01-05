**IT Bridge School – Dev Guide**

- **What’s inside:** NestJS API + Nuxt 4 UI + Postgres (dockerized).
- **Main endpoints:** Auth, profiles, children, groups, attendance, invoices, payments.
- **Ports:** API at http://localhost:3000, Web at http://localhost:3001, DB on 5432.

**Stack**

- Backend: NestJS, TypeORM, class-validator. Swagger schema available in [it-bridge-backend/src/swagger.json](it-bridge-backend/src/swagger.json).
- Frontend: Nuxt 4 + @nuxt/ui, Pinia, Tailwind.
- Data: Postgres 17.

**Project Layout**

- [it-bridge-backend](it-bridge-backend) — NestJS app (entities, modules for auth/profile/child/group/attendance/invoice/payment).
- [it-bridge-frontend](it-bridge-frontend) — Nuxt app (dashboard layout, profile setup/view, payments, etc.).
- [docker-compose.yml](docker-compose.yml) — Postgres + backend + frontend; hot-reload mounts for local dev.

**Quick Start (Docker)**

```bash
docker compose up -d --build
# web: http://localhost:3001
# api: http://localhost:3000
```

**Quick Start (Manual)**

- Backend
  ```bash
  cd it-bridge-backend
  npm install
  npm run start:dev
  ```
- Frontend
  ```bash
  cd it-bridge-frontend
  npm install
  npm run dev -- --host 0.0.0.0 --port 3001
  ```

**Environment**

- DB defaults (from docker-compose): DB_USER=itbridge, DB_PASSWORD=dev_password, DB_NAME=itbridge_db, host=postgres inside Compose or localhost if running locally.
- Frontend API base: set `NUXT_PUBLIC_API_BASE` (or edit [it-bridge-frontend/nuxt.config.ts](it-bridge-frontend/nuxt.config.ts#L1)) to your API URL (e.g., http://localhost:3000).
- Backend port defaults to 3000; override with `PORT` if needed.

**API Docs**

- Swagger JSON: [it-bridge-backend/src/swagger.json](it-bridge-backend/src/swagger.json) (import into Postman/Insomnia). If Swagger UI is enabled, it is typically served at `/api` on the backend port.

**Notes for Reviewers/Demos**

- Login/Register flows drive profile setup; profile and payments pages live under `/user/...`.
- Navbar + dashboard layout are in [it-bridge-frontend/app/layouts](it-bridge-frontend/app/layouts).
- If styling looks off after a hard refresh, ensure the Nuxt API base matches the running backend URL.
