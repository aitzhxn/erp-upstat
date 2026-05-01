# ERP Portal Architect — Persistent Memory

## Stack
- Backend: Node.js + Express 5 + TypeScript, better-sqlite3, JWT auth, multer for uploads
- Frontend: React + TypeScript + Vite (port 5173), Redux for auth state
- Monorepo: /backend and /frontend dirs under project root

## Key Architectural Decisions
- Post-centric RBAC model: `Post` (должность) is the primary entity; user role comes from Post.role
- `user_posts` table maps users to posts (many-to-many)
- `getAllowListForUser` in db.ts controls visibility: Admin=null(all), DeptHead/SectionHead=subtree, Employee/Inspector=own posts only ([]=no access)
- Sanitization via `sanitizeString()` at `/backend/src/middleware/sanitize.ts` — HTML entity escaping, no external dep
- MIME whitelist for uploads in communication.ts via `ALLOWED_MIME_TYPES` Set on multer `fileFilter`
- Helmet applied as FIRST middleware in index.ts, before cors/json
- Rate limiting: 300 req/15min general on /api, 20 req/15min auth on /api/auth/login and /api/auth/signup

## Security Packages (backend/package.json)
- helmet ^8.0.0
- express-rate-limit ^7.0.0

## Frontend Type Conventions
- `Department.managerPostId` (was managerPositionId — renamed Fix 11)
- `Instruction.postId` + `ownerPostId` (was positionId/ownerPositionId)
- `InstructionStep.responsiblePostId` (was responsiblePositionId)
- `WorkPlan.postId`, `PositionStatistics.postId`, `Mailbox.postId` (all formerly positionId)
- `PositionAssignment.positionId` intentionally kept as legacy (maps to a Post ID by convention)
- `orgService.assignToPosition` is a legacy wrapper function — parameter name positionId is local, not a field shape

## Key File Paths
- Backend entry: /backend/src/index.ts
- DB + queries: /backend/src/db.ts
- Auth route: /backend/src/routes/auth.ts
- Org route: /backend/src/routes/org.ts
- Communication route: /backend/src/routes/communication.ts
- Sanitize middleware: /backend/src/middleware/sanitize.ts
- Frontend types: /frontend/src/types/index.ts
- Departments UI: /frontend/src/pages/Departments/DepartmentsView.tsx
