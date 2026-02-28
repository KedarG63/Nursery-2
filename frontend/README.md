# Plant Nursery Management - Frontend

React-based frontend application for the Plant Nursery Management System.

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or yarn 1.22.x
- Backend API running on port 5000

### Installation

**Note:** If you encounter npm installation errors, see [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for workarounds.

```bash
# Install dependencies
npm install
# or
yarn install

# Copy environment configuration
cp .env.example .env

# Start development server
npm run dev
# or
yarn dev
```

Access the app at: http://localhost:5173

## 📁 Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── Layout/      # Layout components (Header, Sidebar, AppLayout)
│   └── Dashboard/   # Dashboard-specific components
├── pages/           # Page components
│   ├── Login/       # Login page
│   └── Dashboard/   # Dashboard page
├── routes/          # Route configuration
├── store/           # Redux store and slices
├── services/        # API service functions
├── hooks/           # Custom React hooks
├── utils/           # Utility functions
├── theme/           # MUI theme configuration
├── i18n/            # Internationalization
│   └── locales/     # Translation files (en.json, hi.json)
└── config/          # App configuration files
```

## 🎨 Tech Stack

- **Framework:** React 18.2
- **Build Tool:** Vite 5.x
- **UI Library:** Material-UI (MUI) 5.x
- **Routing:** React Router v6
- **State Management:** Redux Toolkit
- **Form Handling:** React Hook Form + Zod
- **HTTP Client:** Axios
- **i18n:** react-i18next
- **Notifications:** React Toastify

## 🔐 Authentication

The app uses JWT token-based authentication:
- Login at `/login`
- Token stored in localStorage
- Auto-redirect on 401 responses
- Protected routes require authentication

## 🌐 Multi-language Support

Supports English and Hindi:
- English (en) - Default
- Hindi (hi)

Language files: `src/i18n/locales/`

## 🎯 Features Implemented (Phase 10)

### ✅ Issue #45: React App Structure
- Material-UI theme with green color scheme
- Redux store with auth slice
- React Router v6 setup
- i18n configuration
- API utility with interceptors
- Responsive layout structure

### ✅ Issue #46: Login & Authentication
- Login page with form validation
- JWT token handling
- Auth service for API calls
- Error handling with toast notifications

### ✅ Issue #47: Navigation Menu
- Role-based menu filtering
- Active route highlighting
- Responsive sidebar (mobile/desktop)
- User info display
- Logout functionality

### ✅ Issue #48: Dashboard
- KPI cards (Orders, Lots, Deliveries, Revenue)
- Recent orders widget
- Quick action buttons (role-based)
- Loading and error states

## 🔧 Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_APP_NAME=Plant Nursery Management
VITE_DEFAULT_LANGUAGE=en
```

## 🧪 Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📝 Code Standards

- ESLint for code linting
- Prettier for code formatting (see root `.prettierrc`)
- Use functional components with hooks
- Follow Material-UI best practices
- Keep components small and focused

## 🔄 State Management

Redux slices:
- `authSlice` - Authentication state (user, token, loading, error)

Actions:
- `loginRequest()` - Start login
- `loginSuccess(payload)` - Login successful
- `loginFailure(error)` - Login failed
- `logout()` - Logout user

## 🛣️ Routes

- `/login` - Public login page
- `/` - Dashboard (protected)
- `/products` - Products page (coming soon)
- `/inventory` - Inventory page (coming soon)
- `/orders` - Orders page (coming soon)
- `/customers` - Customers page (coming soon)
- `/deliveries` - Deliveries page (coming soon)
- `/payments` - Payments page (coming soon)
- `/reports` - Reports page (coming soon)

## 👥 User Roles

- **Admin** - Full access to all features
- **Manager** - Access to most features
- **Sales** - Orders, customers, dashboard
- **Warehouse** - Products, inventory, lots
- **Delivery** - Deliveries, routes, dashboard

## 🐛 Troubleshooting

### npm installation fails
See [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for detailed workarounds.

### Backend connection error
Ensure backend is running on the port specified in `.env`

### Login not working
Check:
1. Backend API is accessible
2. CORS is configured correctly in backend
3. JWT token format matches backend expectations

### 401 Unauthorized errors
- Check if token is valid
- Verify Authorization header is being sent
- Check backend auth middleware

## 📚 Documentation

- [Phase 10 Implementation Plan](.github/PHASE_10_IMPLEMENTATION_PLAN.md)
- [Phase 10 Implementation Summary](PHASE_10_IMPLEMENTATION_SUMMARY.md)
- [Setup Instructions](SETUP_INSTRUCTIONS.md)
- [Project Overview](../CLAUDE.md)

## 🚧 Coming Soon (Future Phases)

- Phase 11: Products & Inventory pages
- Phase 12: Customer & Order management
- Phase 13: Delivery management
- Phase 14: Payment & Reports

## 📄 License

Internal project for Plant Nursery Management.

---

**Last Updated:** October 16, 2025
**Phase:** 10 (Issues #45-48) ✅ Completed
