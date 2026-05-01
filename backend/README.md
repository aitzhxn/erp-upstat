# Backend - Enterprise Admin Portal API

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
PORT=3001
JWT_SECRET=your-secret-key-here
NODE_ENV=development
```

3. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Organizational Chart
- `GET /api/org/employees` - Get all employees
- `GET /api/org/employees/:id` - Get employee by ID
- `GET /api/org/departments` - Get all departments
- `GET /api/org/hierarchy` - Get organization hierarchy
- `POST /api/org/employees/:id/move` - Move employee (Admin/Department Head)

### Instructions
- `GET /api/instructions` - Get all instructions
- `GET /api/instructions/:id` - Get instruction by ID
- `POST /api/instructions` - Create instruction
- `PUT /api/instructions/:id` - Update instruction

### Statistics
- `GET /api/statistics` - Get organization statistics
- `GET /api/statistics/department/:id` - Get department statistics

### Finances
- `GET /api/finances` - Get budgets
- `POST /api/finances/:id/approve` - Approve budget (Admin/Department Head)

## Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## RBAC

Routes are protected by role-based access control:
- `Admin` - Full access
- `Inspector` - View and audit access
- `Department Head` - Department management
- `Section Head` - Section management
- `Employee` - Basic access
