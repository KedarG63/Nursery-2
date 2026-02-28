# Quick Start Guide - Phase 15 Reports API

## 🚀 Starting the Application

### Backend Server
```bash
cd backend
npm run dev
```
**Expected Output:**
```
✓ Database connection successful
Server is running on port 5000
```

### Frontend (Separate Terminal)
```bash
cd frontend
npm start
```
**Default URL:** http://localhost:3000 or http://localhost:5173

---

## 📊 Available Report Endpoints

All endpoints require JWT authentication and Admin/Manager roles.

### 1. Sales Report
```bash
GET /api/reports/sales?start_date=2025-01-01&end_date=2025-10-18&group_by=month
```
**Returns:** Revenue trends, top products, KPIs, order status breakdown

### 2. Inventory Report
```bash
GET /api/reports/inventory
```
**Returns:** Stock levels, lot distribution, low stock alerts, upcoming ready lots

### 3. Delivery Performance
```bash
GET /api/reports/delivery?start_date=2025-01-01&end_date=2025-10-18&driver_id=UUID
```
**Returns:** On-time rates, driver performance, failure reasons

### 4. Customer Analytics
```bash
GET /api/reports/customers?start_date=2025-01-01&end_date=2025-10-18
```
**Returns:** Top customers, segmentation, credit utilization, repeat purchase rate

### 5. Financial Summary
```bash
GET /api/reports/financial?start_date=2025-01-01&end_date=2025-10-18&group_by=week
```
**Returns:** Revenue, collections, cash flow, profit margins

---

## 🔐 Authentication

### Get JWT Token
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nursery.com","password":"YOUR_PASSWORD"}'
```

### Use Token in Requests
```bash
curl -X GET http://localhost:5000/api/reports/sales \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📝 Query Parameters

### Date Parameters (Optional)
- `start_date` - Format: YYYY-MM-DD (default: 30 days ago)
- `end_date` - Format: YYYY-MM-DD (default: today)

### Grouping (Optional)
- `group_by` - Values: `day`, `week`, `month` (default: `day`)

### Filters (Optional)
- `driver_id` - UUID (for delivery report)

---

## ✅ Test Status

**Last Tested:** 2025-10-18
**Status:** ✅ ALL TESTS PASSED

- ✅ All 5 endpoints registered
- ✅ Authentication working
- ✅ Authorization enforced
- ✅ Error handling correct
- ✅ Modules load successfully

---

## 📚 Documentation Files

- [PHASE_15_COMPLETION_REPORT.md](PHASE_15_COMPLETION_REPORT.md) - Implementation details
- [PHASE_15_TESTING_GUIDE.md](PHASE_15_TESTING_GUIDE.md) - Comprehensive test cases
- [PHASE_15_TEST_EXECUTION_REPORT.md](PHASE_15_TEST_EXECUTION_REPORT.md) - Test results

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Kill process on port 5000
netstat -ano | findstr :5000
taskkill //PID [PID_NUMBER] //F
```

### Database connection error
```bash
# Check .env file exists
ls backend/.env

# Test database connection
cd backend
npm run migrate:status
```

### Authentication fails
- Ensure user exists in database
- Check password is correct
- Verify JWT_SECRET is set in .env

---

## 🎯 Quick Health Check

```bash
curl http://localhost:5000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-18T..."
}
```

---

## 📊 Frontend Integration

The frontend already has report service functions at:
`frontend/src/services/reportService.js`

**Available Functions:**
- `getSalesReport(params)`
- `getInventoryReport(params)`
- `getDeliveryReport(params)`

---

**Created:** 2025-10-18
**Phase:** 15 - Reports & Analytics Backend API
**Issues:** #70, #71, #72, #73, #74
