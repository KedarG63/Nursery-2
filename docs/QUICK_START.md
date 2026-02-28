# 🚀 Quick Start Guide

## ✅ You're All Set!

Phase 10 implementation is complete and ready to use.

---

## 🔐 Login Credentials

```
📧 Email:    admin@nursery.com
🔑 Password: Admin@123456
```

**⚠️ Change this password after first login!**

---

## 🏃 How to Start the Application

### Step 1: Start the Backend

```bash
cd backend
npm run dev
```

**Expected output:**
```
Server running on http://localhost:5000
Database connection established
```

### Step 2: Start the Frontend (in a new terminal)

```bash
cd frontend
yarn dev
```

**Expected output:**
```
VITE v5.4.20  ready in XXX ms

➜  Local:   http://localhost:5173/
```

### Step 3: Open Browser

Navigate to: **http://localhost:5173**

You'll be automatically redirected to the login page.

### Step 4: Login

1. Enter email: `admin@nursery.com`
2. Enter password: `Admin@123456`
3. Click "Login"

### Step 5: Explore! 🎉

After successful login, you'll see:

✅ **Dashboard** with:
- 4 KPI cards (Orders Today, Ready Lots, Pending Deliveries, Revenue)
- Recent orders table
- Quick action buttons

✅ **Navigation Sidebar** with:
- Dashboard
- Products
- Inventory
- Orders
- Customers
- Deliveries
- Payments
- Reports

✅ **Features**:
- Role-based menu access
- Active route highlighting
- Mobile responsive design
- Language support (English/Hindi)
- User info display
- Logout functionality

---

## 📊 What's Available Now (Phase 10)

### ✅ Authentication
- Login page with form validation
- JWT token authentication
- Auto-redirect for protected routes
- Logout functionality

### ✅ Layout & Navigation
- Responsive sidebar (desktop & mobile)
- Role-based menu filtering
- Active route highlighting
- User profile display

### ✅ Dashboard
- KPI cards with metrics
- Recent orders widget
- Quick action buttons
- Loading & error states

### ⏳ Coming Soon (Phases 11-14)
- Product management pages
- Inventory & lot tracking
- Order management
- Customer management
- Delivery tracking
- Payment processing
- Reports & analytics

---

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check if port 5000 is already in use
netstat -ano | findstr :5000

# Check PostgreSQL is running
psql -d nursery_db -c "SELECT 1;"

# Check .env file exists
cd backend && cat .env
```

### Frontend won't start
```bash
# If port 5173 is in use
netstat -ano | findstr :5173

# Reinstall dependencies if needed
cd frontend
rm -rf node_modules yarn.lock
yarn install
```

### Login fails with "Invalid email or password"
1. Double-check credentials (case-sensitive)
2. Reset password again:
   ```bash
   cd backend
   node reset-admin-password.js
   ```
3. Check backend terminal for error messages
4. Verify user exists in database

### CORS errors
1. Make sure backend is running
2. Check frontend `.env` has: `VITE_API_BASE_URL=http://localhost:5000`
3. Restart both servers

### 401 Unauthorized errors
1. Clear browser localStorage
2. Clear cookies
3. Logout and login again

---

## 📁 Project Structure

```
Nursury_internal_software/
├── backend/
│   ├── controllers/        # Business logic
│   ├── routes/            # API endpoints
│   ├── middleware/        # Auth, validation
│   ├── migrations/        # Database schema
│   ├── utils/             # Helper functions
│   ├── server.js          # Entry point
│   └── .env               # Configuration
│
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── routes/       # Route configuration
│   │   ├── store/        # Redux state
│   │   ├── services/     # API calls
│   │   ├── theme/        # MUI theme
│   │   └── i18n/         # Translations
│   ├── package.json
│   └── .env              # Frontend config
│
└── Documentation/
    ├── QUICK_START.md             # This file
    ├── LOGIN_CREDENTIALS_GUIDE.md # Credential management
    ├── PHASE_10_COMPLETION_REPORT.md
    └── frontend/
        ├── README.md
        ├── INSTALLATION_SUCCESS.md
        └── PHASE_10_IMPLEMENTATION_SUMMARY.md
```

---

## 🔑 Useful Commands

### Backend
```bash
cd backend

# Start dev server
npm run dev

# Run migrations
npm run migrate:up

# Rollback migration
npm run migrate:down

# Create new migration
npm run migrate:create migration-name

# Reset admin password
node reset-admin-password.js

# Create new admin user
node create-admin-user.js
```

### Frontend
```bash
cd frontend

# Start dev server
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview
```

### Database
```bash
# Connect to database
psql nursery_db

# Check users
SELECT email, full_name, status FROM users;

# Check roles
SELECT * FROM roles;

# Check user roles
SELECT u.email, r.name as role
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id;
```

---

## 📚 Documentation

- [LOGIN_CREDENTIALS_GUIDE.md](LOGIN_CREDENTIALS_GUIDE.md) - How to manage credentials
- [PHASE_10_COMPLETION_REPORT.md](PHASE_10_COMPLETION_REPORT.md) - Full implementation report
- [frontend/README.md](frontend/README.md) - Frontend documentation
- [frontend/INSTALLATION_SUCCESS.md](frontend/INSTALLATION_SUCCESS.md) - Installation guide
- [CLAUDE.md](CLAUDE.md) - Project overview & architecture

---

## ✅ Success Checklist

After starting the application, verify:

- [ ] Backend running on port 5000
- [ ] Frontend running on port 5173
- [ ] Can access http://localhost:5173
- [ ] Redirected to /login page
- [ ] Login form appears with email/password fields
- [ ] Can login with credentials above
- [ ] Redirected to dashboard after login
- [ ] KPI cards display (may show 0 values)
- [ ] Sidebar navigation visible
- [ ] Menu items appropriate for Admin role
- [ ] Can navigate between pages
- [ ] Logout button works
- [ ] After logout, redirected back to login

---

## 🎯 Next Steps

1. **Start using the application** with the credentials above
2. **Change the admin password** (when password change feature is added)
3. **Create additional users** if needed (via register endpoint)
4. **Implement backend dashboard APIs** to show real data:
   - `GET /api/dashboard/kpis`
   - `GET /api/orders/recent`
   - `GET /api/deliveries/pending`
   - `GET /api/payments/overdue`
5. **Continue with Phase 11** (Products & Inventory pages)

---

## 🆘 Need Help?

1. Check the documentation files listed above
2. Look at backend terminal logs for errors
3. Check browser console for frontend errors
4. Verify database connection is working
5. Ensure all migrations have run

---

**Last Updated:** October 16, 2025
**Phase:** 10 - Authentication & Layout ✅
**Status:** Ready for Production Use

**Happy Coding! 🚀**
