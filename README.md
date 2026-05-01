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
JWT_SECRET=your-secret-key-here
NODE_ENV=development
# DATABASE_PATH=./data.db
```

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
