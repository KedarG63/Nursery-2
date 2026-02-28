# Frontend Setup Instructions

## Known Issue: NPM Installation Error

There's a known issue with npm 10.8.2 on Windows that causes:
```
npm error Cannot read properties of null (reading 'location')
```

## Workaround Solutions

### Option 1: Use Yarn (Recommended)
```bash
# Install Yarn globally if not already installed
npm install -g yarn

# Navigate to frontend directory
cd frontend

# Install dependencies with Yarn
yarn install

# Start development server
yarn dev
```

### Option 2: Downgrade NPM
```bash
# Downgrade to npm 9.x
npm install -g npm@9

# Try installation again
cd frontend
npm install
```

### Option 3: Use Node Version Manager (NVM)
```bash
# Install a different Node version
nvm install 18.18.0
nvm use 18.18.0

# Try installation again
cd frontend
npm install
```

### Option 4: Manual Dependency Installation
If all else fails, try installing dependencies in smaller batches:

```bash
cd frontend

# Install core dependencies first
npm install react react-dom

# Install UI dependencies
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled

# Install routing and state management
npm install react-router-dom @reduxjs/toolkit react-redux

# Install form handling
npm install react-hook-form @hookform/resolvers zod

# Install utilities
npm install axios react-toastify react-i18next i18next

# Install dev dependencies
npm install --save-dev vite @vitejs/plugin-react
```

## After Successful Installation

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

3. **Open browser:**
   - Navigate to http://localhost:5173
   - Login with your backend credentials

## Verify Installation

After installation, verify all dependencies are installed:
```bash
npm list --depth=0
```

You should see all these packages:
- react, react-dom
- @mui/material, @mui/icons-material
- react-router-dom
- @reduxjs/toolkit, react-redux
- react-hook-form, zod
- axios
- react-toastify
- react-i18next, i18next

## Troubleshooting

### Clear npm cache
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
```

### Check npm and node versions
```bash
node --version  # Should be 18.x or higher
npm --version   # Try 9.x if 10.x has issues
```

### Backend must be running
Ensure the backend server is running on port 5000:
```bash
cd ../backend
npm run dev
```

## Test Login

Use these test credentials (if available in your backend):
- Email: admin@nursery.com
- Password: [your admin password]

Or create a new user via the backend API.
