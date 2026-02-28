# Nursery Management System

A comprehensive plant nursery management system with inventory tracking, customer management, orders, payments, delivery, and WhatsApp integration.

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm or yarn

## Project Structure

```
nursery-management-system/
├── backend/          # Express.js REST API
├── frontend/         # React frontend with Vite
├── package.json      # Root workspace configuration
└── README.md
```

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/KedarG63/nursery_management.git
cd nursery_management
```

### 2. Install dependencies

```bash
npm install
```

This will install dependencies for both backend and frontend using npm workspaces.

### 3. Configure environment variables

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

**Frontend:**
```bash
cd frontend
cp .env.example .env
# Edit if needed (defaults should work for local dev)
```

### 4. Setup PostgreSQL database

Create a PostgreSQL database:
```bash
createdb nursery_db
```

Or using psql:
```sql
CREATE DATABASE nursery_db;
```

### 5. Run database migrations

```bash
npm run migrate:up --workspace=backend
```

## Development

### Run both backend and frontend concurrently:

```bash
npm run dev
```

### Run individually:

**Backend only:**
```bash
npm run dev:backend
# Server runs on http://localhost:5000
```

**Frontend only:**
```bash
npm run dev:frontend
# Frontend runs on http://localhost:5173
```

## Available Scripts

### Root level
- `npm run dev` - Run both backend and frontend
- `npm run lint` - Lint all files
- `npm run format` - Format code with Prettier

### Backend
- `npm run dev --workspace=backend` - Start dev server with nodemon
- `npm run migrate:up --workspace=backend` - Run migrations
- `npm run migrate:down --workspace=backend` - Rollback migration
- `npm run migrate:create --workspace=backend` - Create new migration

### Frontend
- `npm run dev --workspace=frontend` - Start Vite dev server
- `npm run build --workspace=frontend` - Build for production

## Technology Stack

**Backend:**
- Node.js with Express.js
- PostgreSQL with pg library
- node-pg-migrate for migrations
- JWT authentication
- CORS enabled

**Frontend:**
- React 18
- Vite for fast development
- Axios for API calls

**Development Tools:**
- ESLint for code quality
- Prettier for code formatting
- Husky for git hooks
- lint-staged for pre-commit checks

## Database Migrations

This project uses `node-pg-migrate` for managing database schema changes. All migrations are stored in `backend/migrations/` and are tracked in the `pgmigrations` table.

### Migration Commands

**Create a new migration:**
```bash
npm run migrate:create --workspace=backend -- migration_name
```

This creates a new timestamped migration file in `backend/migrations/` with `up` and `down` functions.

**Run pending migrations:**
```bash
npm run migrate:up --workspace=backend
```

This applies all pending migrations in order.

**Rollback last migration:**
```bash
npm run migrate:down --workspace=backend
```

This reverts the most recently applied migration.

### Migration Best Practices

1. **Idempotency**: Always write migrations that can be safely re-run (use `IF EXISTS`, `IF NOT EXISTS`)
2. **Down migrations**: Always implement the `down` function to allow rollbacks
3. **Testing**: Test both `up` and `down` migrations before committing
4. **Small changes**: Keep migrations focused on a single logical change
5. **No data loss**: Never write migrations that delete data without explicit approval

### Example Migration Structure

```javascript
exports.up = pgm => {
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true, unique: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });
};

exports.down = pgm => {
  pgm.dropTable('users', { ifExists: true });
};
```

## Git Hooks

Pre-commit hook automatically runs:
- ESLint with auto-fix
- Prettier formatting

## License

ISC
