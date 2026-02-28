# 🔐 Login Credentials Guide

## Current Situation

An admin user already exists in your database:
- **Email:** `admin@nursery.com`
- **Password:** Unknown (not stored in code)

## How to Get Login Credentials

### Option 1: Reset the Admin Password (Recommended)

Run this command to reset the admin password to a known value:

```bash
cd backend
node -e "
const bcrypt = require('bcrypt');
const pool = require('./utils/db');

(async () => {
  const newPassword = 'Admin@123456';
  const hash = await bcrypt.hash(newPassword, 10);

  const result = await pool.query(
    'UPDATE users SET password_hash = \$1 WHERE email = \$2 RETURNING email',
    [hash, 'admin@nursery.com']
  );

  if (result.rows.length > 0) {
    console.log('\\n✅ Password reset successfully!\\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   📧 Email:    admin@nursery.com');
    console.log('   🔑 Password: Admin@123456');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\\n💡 Login at: http://localhost:5173\\n');
  } else {
    console.log('❌ User not found');
  }

  await pool.closePool();
})();
"
```

### Option 2: Create a New Admin User

If you want to create a new admin user instead:

```bash
cd backend
node create-admin-user.js
```

This will:
- Create a new admin user (if none exists)
- Display the credentials
- Assign the Admin role

### Option 3: Register via API

Use the registration endpoint to create a new user:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your.email@nursery.com",
    "password": "YourPassword123!",
    "fullName": "Your Name",
    "phone": "+919876543210"
  }'
```

Then manually assign the Admin role in the database.

### Option 4: Check Database Directly

If you have database access:

```bash
# Connect to your database
psql nursery_db

# Check existing users
SELECT email, full_name, status FROM users;

# If you know the password was set before, try common ones:
# - Admin@123456
# - admin123
# - password123
```

## Default Test Credentials

Based on the test scripts in your backend, there might be test users:

### Test User 1:
- **Email:** `test.payment@nursery.com`
- **Password:** `Test@1234`

### Test User 2:
- **Email:** `payment.test@example.com`
- **Password:** (Unknown, check test scripts)

### Test Drivers:
- **Email:** `rajesh.driver@nursery.com`
- **Password:** (Placeholder hash, won't work)

## After Getting Credentials

### 1. Start Backend
```bash
cd backend
npm run dev
```

### 2. Start Frontend
```bash
cd frontend
yarn dev
```

### 3. Login
1. Open http://localhost:5173
2. You'll be redirected to `/login`
3. Enter your credentials:
   - Email: `admin@nursery.com`
   - Password: (the one you set)
4. Click "Login"

### 4. Expected Result
✅ Successful login → Dashboard with:
- KPI cards (Orders, Lots, Deliveries, Revenue)
- Recent orders table
- Quick action buttons
- Sidebar navigation menu

### 5. Change Password After First Login
⚠️ **IMPORTANT:** The default password should be changed immediately after first login!

(Password change feature will be implemented in a future phase)

## Troubleshooting Login Issues

### "Invalid email or password" Error
1. **Double-check credentials** - Email and password are case-sensitive
2. **Check backend logs** - Look for authentication errors
3. **Verify user exists:**
   ```bash
   cd backend
   node -e "
   const pool = require('./utils/db');
   pool.query('SELECT email, status FROM users WHERE email = \\'admin@nursery.com\\'')
     .then(r => console.log(r.rows))
     .then(() => pool.closePool());
   "
   ```
4. **Check if user is active** - Status should be 'active'

### Backend Not Responding
1. Check if backend is running on port 5000
2. Check `.env` file configuration
3. Look for errors in terminal

### CORS Error
If you see CORS errors in browser console:
1. Check backend CORS configuration
2. Verify frontend is running on http://localhost:5173
3. Check backend allows origin from frontend

### Token Issues
If you see 401 errors after login:
1. Clear browser localStorage
2. Clear cookies
3. Try logging in again

## Security Notes

🔒 **For Development:**
- Default credentials are acceptable
- Password: `Admin@123456` is fine for local testing

⚠️ **For Production:**
- Use strong, unique passwords
- Enable 2FA (when implemented)
- Change default credentials immediately
- Use environment variables for sensitive data
- Enable HTTPS
- Implement rate limiting
- Regular security audits

## Quick Reset Script

Save this as `reset-admin-password.js` in backend folder:

```javascript
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./utils/db');

async function resetPassword() {
  const newPassword = process.argv[2] || 'Admin@123456';
  const email = process.argv[3] || 'admin@nursery.com';

  const hash = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email',
    [hash, email]
  );

  if (result.rows.length > 0) {
    console.log(`✅ Password reset for ${email}`);
    console.log(`🔑 New password: ${newPassword}`);
  } else {
    console.log(`❌ User ${email} not found`);
  }

  await pool.closePool();
}

resetPassword();
```

**Usage:**
```bash
# Reset with default password
node reset-admin-password.js

# Reset with custom password
node reset-admin-password.js "MyNewPassword123!"

# Reset different user
node reset-admin-password.js "Password123!" "user@example.com"
```

## Support

If you're still having issues:
1. Check backend logs for errors
2. Verify database connection is working
3. Ensure migrations have run successfully
4. Check that user has the Admin role assigned

---

**Last Updated:** October 16, 2025
**Related Files:**
- `backend/create-admin-user.js` - Create new admin
- `backend/controllers/authController.js` - Login logic
- `frontend/src/pages/Login/Login.jsx` - Login UI
