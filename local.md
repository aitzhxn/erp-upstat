# Running the Enterprise Admin Portal locally

This guide covers **how to start** the stack, **how to stop** everything cleanly, and **which URLs / databases** each mode uses.

---

## Prerequisites

- **Node.js 20+** and npm (for host-based dev).
- **Docker Desktop** (or Docker Engine + Compose v2) for container workflows.
- **Optional:** `make` — the repo includes a `Makefile` with shortcuts.

First-time setup on the host (without Docker):

```bash
cd backend && npm install
cd ../frontend && npm install
```

Create **`backend/.env`** from `backend/.env.example` if you do not have it yet. **`JWT_SECRET`** must be **at least 32 characters** or the backend exits on startup.

---

## Modes overview

| Mode | What runs | Typical URLs | Database |
|------|-------------|--------------|----------|
| **A. Production Docker** | `docker-compose.yml` — db + backend + Nginx frontend | http://localhost (port **80**) | **PostgreSQL** in Docker volume **`postgres_data`** |
| **B. Local Docker** | `docker-compose.local.yml` — same images, published API port | Frontend: http://localhost:**8080** (default), API: http://localhost:**3001** | **PostgreSQL** (`postgres_data`; separate volume per Compose project name unless you align names) |
| **C. Local Docker + hot reload** | B + `docker-compose.local.dev.yml` overlay | Frontend dev: http://localhost:**5173**, API: **3001** | Same as B; bind-mounts source for live reload |
| **D. Fully on the host** | `npm run dev` in `backend` + `frontend` | Frontend: http://localhost:**5173**, API: http://localhost:**3001** | **PostgreSQL** on the host (or remote); set **`DATABASE_URL`** in `backend/.env` |

**Important:** Only **one** thing should listen on **port 3001** at a time. If **Docker** already bound **3001**, a host `npm run dev` backend will fail (or the opposite). Stop the stack that uses 3001 before switching modes.

---

## A. Production-like stack (root `docker-compose.yml`)

### Start

From the **repository root**:

```bash
docker compose up --build -d
```

Or: `docker-compose up --build -d`

- **App:** http://localhost  
- **API:** only via the browser as **`/api`** (Nginx proxies to the backend). The backend port is **not** published to the host by default.

Optional: copy **root** `.env.example` → `.env` for `JWT_SECRET` / `POSTGRES_PASSWORD` (see main **README.md**).

### Stop

```bash
docker compose down
```

To also remove named volumes (**Postgres** data):

```bash
docker compose down -v
```

### Start again

```bash
docker compose up --build -d
```

---

## B. Local Docker (published ports) — `Makefile` / `docker-compose.local.yml`

Uses **production images** but maps **8080 → frontend** and **3001 → backend** (defaults; override with `LOCAL_WEB_PORT` / `LOCAL_API_PORT`).

### Start

From the **repository root**:

```bash
make up-local
```

Equivalent:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

### Stop

```bash
make down-local
```

Equivalent:

```bash
docker compose -f docker-compose.local.yml down
```

### Start again

```bash
make up-local
```

### Logs / status

```bash
make logs-local    # follow logs
make ps-local      # container status
```

---

## C. Local Docker with hot reload (dev overlay)

### Start

```bash
make up-local-dev
```

Equivalent:

```bash
docker compose -f docker-compose.local.yml -f docker-compose.local.dev.yml up -d --build
```

- **Frontend (Vite):** http://localhost:5173  
- **Backend API:** http://localhost:3001  

`docker-compose.local.dev.yml` bind-mounts `backend/src`, `frontend/src`, etc., so edits reload without rebuilding images.

### Stop

```bash
make down-local-dev
```

### Start again

```bash
make up-local-dev
```

### Logs

```bash
make logs-local-dev
make ps-local-dev
```

---

## D. Fully on the host (no Docker for Node)

Use this when you want the fastest edit cycle without rebuilding API/frontend images. You still need **PostgreSQL** reachable from the host and **`DATABASE_URL`** in `backend/.env`.

### Start

**Terminal 1 — backend**

```bash
cd backend
npm run dev
```

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev
```

- **Frontend:** http://localhost:5173 (or the URL Vite prints).  
- **API:** `http://localhost:3001` — ensure **`frontend/.env`** (or defaults) has `VITE_API_URL=http://localhost:3001/api` if the UI does not reach the API.

### Stop

In each terminal: **Ctrl+C**.

---

## Stopping “everything” when you are unsure what is running

1. **Stop all project Compose stacks** (from repo root):

   ```bash
   docker compose down
   docker compose -f docker-compose.local.yml down
   docker compose -f docker-compose.local.yml -f docker-compose.local.dev.yml down
   ```

2. **See what uses port 3001** (macOS / Linux):

   ```bash
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   ```

   - If you see **`com.docke`** or **docker-proxy**, Docker still has something on **3001** — bring down the matching compose file (`make down-local` or `make down-local-dev`, or root compose if you published 3001 elsewhere).

3. **Host Node** left running: close those terminals or kill the **PID** from `lsof`.

4. **Optional — remove local Docker volumes** (wipes **Postgres** data for the local stack):

   ```bash
   make clean-local
   ```

   (`docker compose … down -v` for the local compose file only.)

---

## Databases: Docker vs host

- **Docker (modes A / B / C):** the API uses **`DATABASE_URL`** pointing at the **`db`** service (see `docker-compose.local.yml` / root `docker-compose.yml`). Data lives in the **`postgres_data`** volume.
- **Host dev (mode D):** run PostgreSQL locally (or use Docker only for `db`) and set **`DATABASE_URL`** in `backend/.env` to match.

To list users **inside** the backend container (requires `psql` in the image — use **`db`** service instead):

```bash
docker compose -f docker-compose.local.yml exec db psql -U erp -d erpupstat -c "SELECT id, email FROM users LIMIT 20;"
```

(Use **`-f docker-compose.local.yml`** for the local stack, or omit **`-f`** for the root production file.)

---

## Admin role (quick reference)

Admin is tied to org post **`p1`**. On the **host** with **host** DB:

```bash
cd backend
npx ts-node scripts/assign-admin-by-email.ts you@example.com
```

In **Docker**, the runtime API image does not include **`ts-node`**. Either run the same command on the **host** with a **`DATABASE_URL`** that reaches the DB (for example temporarily map **`5432:5432`** on the `db` service in a local override), or apply the equivalent change via **`psql`** inside the **`db`** container.

After changing roles: **log out and log in** in the browser.

---

## Makefile quick reference

| Command | Purpose |
|---------|---------|
| `make help` | List all targets |
| `make build` / `make up` / `make down` | Production stack (root `docker-compose.yml`) |
| `make up-local` | Local Docker stack (build + up) |
| `make down-local` | Stop local Docker stack |
| `make up-local-dev` | Local Docker + hot reload |
| `make down-local-dev` | Stop dev overlay stack |
| `make logs-local` / `make logs-local-dev` | Follow logs |
| `make ps-local` / `make ps-local-dev` | Container status |
| `make clean-local` | `down -v` for local stack (deletes volumes) |
| `make dev-backend` / `make dev-frontend` | Print-style reminder to run host dev servers from `backend` / `frontend` |

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **Port 3001 already in use** | Stop the other stack (`docker compose down`, `make down-local`, or stop host `npm run dev`). |
| **Frontend cannot reach API** | Check `VITE_API_URL`. In Docker behind Nginx use **`/api`**. On host dev use **`http://localhost:3001/api`**. |
| **JWT / 500 on start** | `JWT_SECRET` length ≥ 32 in **`backend/.env`** (and root `.env` for compose overrides if used). |
| **CORS** | Backend allows origins like **http://localhost:5173**; if you change the frontend port, update **`backend/src/index.ts`** CORS list if needed. |

For production Docker details (env files, volumes), see the main **README.md** section **Docker (production stack)**.
