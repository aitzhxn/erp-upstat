# Enterprise Admin Portal

Enterprise internal admin portal with organizational chart, instructions, statistics, work plans, financial planning, and communication modules.

## Architecture

### Central Entity: Organizational Chart
- Stores: employees, positions, departments, hierarchy
- Connections: statistics and instructions are linked to employees/positions
- Finances are linked to departments

### Modules
- **Organizational Chart** - Central entity with company structure
- **Statistics** - Linked to organizational chart (employees/departments)
- **Instructions** - Linked to organizational chart (positions/roles)
- **Financial Planning** - Separate module, linked to departments
- **Communication** - Separate module, ready for email API integration

## Tech Stack

### Frontend
- React 19 + TypeScript
- Vite
- Tailwind CSS
- Redux Toolkit
- React Router
- shadcn/ui components
- Lucide React icons

### Backend
- Node.js + Express
- TypeScript
- JWT authentication
- RBAC middleware

## Project Structure

```
.
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/      # Sidebar, TopBar, Layout
│   │   │   ├── ui/           # Reusable UI components
│   │   │   └── rbac/         # RBAC components
│   │   ├── pages/            # Page components
│   │   ├── store/            # Redux store and slices
│   │   ├── services/         # API services
│   │   ├── types/            # TypeScript types
│   │   └── utils/            # Utility functions
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Auth and RBAC middleware
│   │   ├── types/            # TypeScript types
│   │   └── index.ts          # Entry point
│   └── package.json
└── README.md
```

## Features

### RBAC (Role-Based Access Control)
- **Admin** - Full access
- **Inspector** - View and audit access
- **Department Head** - Department management
- **Section Head** - Section management
- **Employee** - Basic access

### Pages
1. **Dashboard** - KPI cards, alerts, tasks, approvals, audit preview
2. **Organizational Chart** - Tree/graph view, search, employee details, move employee
3. **Instructions** - List with filters, detail page with tabs (steps, attachments, comments, history, audit)
4. **Statistics** - Organization-wide statistics linked to org chart
5. **Work Plans** - List and Kanban views with filters
6. **Financial Planning** - Budget management with approval flow
7. **Communication** - Corporate messaging (ready for email API)

## Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
npm run dev
```

## Docker (production stack)

The repository includes **multi-stage Dockerfiles** and a **root `docker-compose.yml`** with three services:

| Service    | Role |
|------------|------|
| **frontend** | Nginx (`nginx:alpine`) serves the Vite build and proxies `/api/*` to the backend. |
| **backend**  | Node.js API (Express). Persists data with **SQLite** on the `backend_data` volume (`DATABASE_PATH=/app/data/data.db`). |
| **db**       | **PostgreSQL 16** (Alpine). The API does **not** connect to it yet; it is included for a conventional three-tier layout and future migration. Startup order: **db → backend → frontend**. |

### Run everything (one command)

From the **repository root** (where `docker-compose.yml` lives):

```bash
docker compose up --build -d
```

Legacy CLI (same effect):

```bash
docker-compose up --build -d
```

- App URL: **http://localhost** (port **80** → frontend container).
- API is reached through the frontend at **`/api`** (no public backend port in the default compose file).

### Environment variables

Compose interpolates variables from a **`.env` file next to `docker-compose.yml`** (or from your shell). Copy the template:

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET (≥32 characters) and POSTGRES_PASSWORD
```

How variables reach containers:

1. **Root `.env`** — used for `${JWT_SECRET}`, `${POSTGRES_PASSWORD}`, etc. in `docker-compose.yml`.
2. **`backend/.env`** — loaded into the backend container via `env_file: ./backend/.env` (create from `backend/.env.example`). Values under `environment:` in compose **override** keys with the same name from that file when both are set (e.g. `JWT_SECRET`).

Ensure **`JWT_SECRET`** is at least **32 characters** or the backend process exits on startup.

### Useful commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

Volumes **`backend_data`** (SQLite) and **`postgres_data`** survive `docker compose down`; add `-v` to remove them.

## Design Tokens

- Background: `#F8FAFC`
- Surface: `#FFFFFF`
- Border: `#E2E8F0`
- Text Primary: `#0F172A`
- Text Secondary: `#475569`
- Primary: `#2563EB`
- Warning: `#D97706`
- Error: `#DC2626`
- Success: `#16A34A`
- Font: Inter
- Base spacing: 8px
- Border radius: 8-10px

## Environment Variables

### Backend (.env)
```
PORT=3001
JWT_SECRET=erp-upstat-dev-change-me-in-production-32chars
NODE_ENV=development
# DATABASE_PATH=./data.db
```

`JWT_SECRET` must be **at least 32 characters** or the server exits on startup. Docker Compose files set a long default if you omit `JWT_SECRET` in your shell / project `.env` used for interpolation; `backend/.env` alone can still contain a short value unless you copy from `.env.example`.

### Frontend
- `VITE_API_URL` - API base URL (default: `http://localhost:3001/api`)

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - Login
- `POST /api/auth/signup` - Register new user
- `GET /api/auth/me` - Current user (validates token)
- `GET /api/org/employees` - Get employees
- `GET /api/org/departments` - Get departments
- `GET /api/org/posts` - Get posts (org chart)
- `GET /api/instructions` - Get instructions
- `GET /api/instructions/:id/steps` - Get instruction steps
- `POST /api/instructions/:id/steps` - Create step
- `GET /api/statistics` - Get statistics
- `GET /api/finances` - Get budgets
- `POST /api/finances/:id/approve` - Approve budget
- `GET /api/work-plans` - List work plans
- `POST /api/work-plans` - Create work plan
- `PUT /api/work-plans/:id` - Update work plan
- `GET /api/communication` - Mailbox messages
- `PATCH /api/communication/messages/:id/read` - Mark message read
- `GET /api/audit/recent` - Recent audit log (Dashboard)

## License

Internal use only
