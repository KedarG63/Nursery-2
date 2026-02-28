# Phase 13 Testing Guide: Delivery & GPS Tracking

This guide provides step-by-step instructions for testing all Phase 13 features.

## Prerequisites

1. Backend server running on `http://localhost:5000`
2. Database migrations completed
3. curl or Postman installed

## Start the Server

```bash
cd backend
npm run dev
```

---

## Test Suite 1: Vehicle Management

### 1.1 Create a Vehicle

```bash
curl -X POST http://localhost:5000/api/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "registrationNumber": "DL01AB1234",
    "vehicleType": "truck",
    "capacityUnits": 100,
    "capacityWeightKg": 1000,
    "makeModel": "Tata LPT 1212",
    "year": 2023,
    "color": "white",
    "fuelType": "diesel",
    "gpsProvider": "mock",
    "gpsDeviceId": "GPS001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "vehicle": {
    "id": "uuid",
    "registration_number": "DL01AB1234",
    "vehicle_type": "truck",
    "status": "available",
    ...
  }
}
```

### 1.2 List All Vehicles

```bash
curl -X GET http://localhost:5000/api/vehicles
```

**Expected Response:**
- List of all vehicles with pagination
- Status 200

### 1.3 Get Vehicle by ID

Replace `VEHICLE_ID` with actual vehicle ID from previous response.

```bash
curl -X GET http://localhost:5000/api/vehicles/VEHICLE_ID
```

### 1.4 Update Vehicle

```bash
curl -X PUT http://localhost:5000/api/vehicles/VEHICLE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "status": "maintenance",
    "odometerReading": 15000
  }'
```

### 1.5 Filter Vehicles by Status

```bash
curl -X GET "http://localhost:5000/api/vehicles?status=available"
```

### 1.6 Get Vehicle Maintenance History

```bash
curl -X GET http://localhost:5000/api/vehicles/VEHICLE_ID/maintenance
```

### 1.7 Get Vehicle Location History

```bash
curl -X GET http://localhost:5000/api/vehicles/VEHICLE_ID/location-history
```

### 1.8 Delete Vehicle (Soft Delete)

```bash
curl -X DELETE http://localhost:5000/api/vehicles/VEHICLE_ID
```

**Note:** Only vehicles not in use can be deleted.

---

## Test Suite 2: Delivery Route Management

### 2.1 Create a Delivery Route

First, you need existing orders. Then create a route:

```bash
curl -X POST http://localhost:5000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "orderIds": ["ORDER_ID_1", "ORDER_ID_2", "ORDER_ID_3"],
    "routeDate": "2025-10-18",
    "plannedStartTime": "2025-10-18T09:00:00.000Z",
    "notes": "Morning delivery route"
  }'
```

### 2.2 List All Routes

```bash
curl -X GET http://localhost:5000/api/routes
```

**Query Parameters:**
- `status` - Filter by status (planned, assigned, in_progress, completed)
- `routeDate` - Filter by date (YYYY-MM-DD)
- `driverId` - Filter by driver ID
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

### 2.3 Get Route by ID

```bash
curl -X GET http://localhost:5000/api/routes/ROUTE_ID
```

**Expected Response:** Route details with all stops

### 2.4 Assign Driver and Vehicle to Route

```bash
curl -X PUT http://localhost:5000/api/routes/ROUTE_ID/assign \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "DRIVER_USER_ID",
    "vehicleId": "VEHICLE_ID"
  }'
```

### 2.5 Start a Route

```bash
curl -X PUT http://localhost:5000/api/routes/ROUTE_ID/start \
  -H "Content-Type: application/json" \
  -d '{
    "startLocation": {
      "latitude": 28.7041,
      "longitude": 77.1025
    }
  }'
```

### 2.6 Get Route Progress

```bash
curl -X GET http://localhost:5000/api/routes/ROUTE_ID/progress
```

---

## Test Suite 3: Driver Mobile App API

**Note:** All driver endpoints require authentication. You'll need a valid JWT token for a user with the "Delivery" role.

### 3.1 Get Driver Authentication Token

First, login as a driver:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "password123"
  }'
```

Save the token from the response.

### 3.2 Get Today's Routes

```bash
curl -X GET http://localhost:5000/api/driver/routes/today \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3.3 Mark Arrival at Stop

```bash
curl -X POST http://localhost:5000/api/driver/stops/STOP_ID/arrive \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 28.6139,
      "longitude": 77.2090
    },
    "arrivalTime": "2025-10-18T10:30:00.000Z"
  }'
```

### 3.4 Mark Delivery Complete

```bash
curl -X POST http://localhost:5000/api/driver/stops/STOP_ID/deliver \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 28.6139,
      "longitude": 77.2090
    },
    "deliveryTime": "2025-10-18T10:45:00.000Z"
  }'
```

### 3.5 Upload Delivery Proof

```bash
curl -X POST http://localhost:5000/api/driver/stops/STOP_ID/proof \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/photo.jpg" \
  -F "proofType=photo" \
  -F "customerRating=5" \
  -F "customerFeedback=Great service!" \
  -F 'location={"latitude":28.6139,"longitude":77.2090}'
```

### 3.6 Get Navigation Details

```bash
curl -X GET http://localhost:5000/api/driver/stops/STOP_ID/navigation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3.7 Update GPS Location

```bash
curl -X POST http://localhost:5000/api/driver/location \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "VEHICLE_ID",
    "routeId": "ROUTE_ID",
    "location": {
      "latitude": 28.6139,
      "longitude": 77.2090
    },
    "speed": 45,
    "heading": 90,
    "timestamp": "2025-10-18T10:00:00.000Z"
  }'
```

---

## Test Suite 4: GPS Webhooks

### 4.1 Test GPS Webhook (Mock)

```bash
curl -X POST http://localhost:5000/webhooks/gps/test \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "VEHICLE_ID",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "speed": 45,
    "heading": 90,
    "timestamp": "2025-10-18T10:00:00.000Z"
  }'
```

### 4.2 LocoNav GPS Webhook

```bash
curl -X POST http://localhost:5000/webhooks/gps/loconav \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "GPS001",
    "lat": 28.6139,
    "lng": 77.2090,
    "speed": 45,
    "heading": 90,
    "timestamp": "2025-10-18T10:00:00.000Z"
  }'
```

### 4.3 FleetX GPS Webhook

```bash
curl -X POST http://localhost:5000/webhooks/gps/fleetx \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_id": "GPS001",
    "location": {
      "lat": 28.6139,
      "lon": 77.2090
    },
    "speed": 45,
    "direction": 90,
    "recorded_at": "2025-10-18T10:00:00.000Z"
  }'
```

---

## Test Suite 5: Integration Tests

### 5.1 Complete Delivery Flow

1. **Create Vehicle**
2. **Create Route from Orders**
3. **Assign Driver and Vehicle to Route**
4. **Driver Logs In**
5. **Driver Starts Route**
6. **Driver Marks Arrival at First Stop**
7. **Driver Uploads Delivery Proof**
8. **Driver Marks Delivery Complete**
9. **Repeat for All Stops**
10. **Route Auto-Completes When All Stops Delivered**

### 5.2 GPS Tracking Flow

1. **Create Vehicle with GPS Device**
2. **Assign to Route**
3. **Start Route**
4. **Send GPS Updates via Driver App**
5. **Verify Location History**
6. **Check Real-time Progress**

---

## Validation Tests

### Test Input Validation

#### Invalid Vehicle Type
```bash
curl -X POST http://localhost:5000/api/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "registrationNumber": "TEST123",
    "vehicleType": "invalid_type",
    "capacityUnits": 100
  }'
```
**Expected:** 400 error with validation message

#### Invalid GPS Coordinates
```bash
curl -X POST http://localhost:5000/api/driver/location \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "VEHICLE_ID",
    "location": {
      "latitude": 999,
      "longitude": 999
    }
  }'
```
**Expected:** 400 error with validation message

#### Missing Required Fields
```bash
curl -X POST http://localhost:5000/api/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "registrationNumber": "TEST123"
  }'
```
**Expected:** 400 error listing missing fields

---

## Performance Tests

### Load Test: Vehicle Creation

```bash
for i in {1..100}; do
  curl -X POST http://localhost:5000/api/vehicles \
    -H "Content-Type: application/json" \
    -d "{\"registrationNumber\":\"TEST$i\",\"vehicleType\":\"van\",\"capacityUnits\":50}" &
done
wait
```

### Load Test: GPS Updates

```bash
for i in {1..1000}; do
  curl -X POST http://localhost:5000/webhooks/gps/test \
    -H "Content-Type: application/json" \
    -d "{\"vehicleId\":\"VEHICLE_ID\",\"latitude\":28.$i,\"longitude\":77.$i,\"timestamp\":\"2025-10-18T10:00:00.000Z\"}" &
  if [ $((i % 100)) -eq 0 ]; then
    wait
  fi
done
```

---

## Error Scenarios

### Test Concurrent Vehicle Assignment

1. Create a vehicle
2. Try to assign to two routes simultaneously
3. Verify only one assignment succeeds

### Test Vehicle in Maintenance

1. Set vehicle status to "maintenance"
2. Try to assign to route
3. Verify assignment fails with appropriate error

### Test Unauthorized Driver Access

1. Get driver A's token
2. Try to access driver B's routes
3. Verify 403 Forbidden response

---

## Monitoring & Debugging

### Check Server Logs

```bash
cd backend
npm run dev
```

Watch for:
- Database query logs
- API request logs
- Error messages
- GPS tracking updates

### Database Verification

```sql
-- Check vehicle count
SELECT COUNT(*) FROM vehicles WHERE deleted_at IS NULL;

-- Check active routes
SELECT * FROM delivery_routes WHERE status IN ('assigned', 'in_progress');

-- Check GPS tracking data
SELECT * FROM gps_tracking ORDER BY recorded_at DESC LIMIT 10;

-- Check driver assignments
SELECT * FROM driver_assignments WHERE is_active = true;
```

---

## Cleanup After Testing

### Delete Test Data

```bash
# Note: These are soft deletes
curl -X DELETE http://localhost:5000/api/vehicles/VEHICLE_ID_1
curl -X DELETE http://localhost:5000/api/vehicles/VEHICLE_ID_2
```

### Reset Database (Optional)

```bash
cd backend
npm run migrate:down
npm run migrate:up
```

---

## Common Issues & Solutions

### Issue: "Vehicle already exists"
**Solution:** Use a different registration number or delete the existing vehicle

### Issue: "Route not found"
**Solution:** Verify route ID and ensure route hasn't been deleted

### Issue: "No token provided"
**Solution:** Include `Authorization: Bearer YOUR_TOKEN` header

### Issue: "Cannot assign vehicle that is in use"
**Solution:** Wait for current route to complete or use a different vehicle

### Issue: "Orders have invalid coordinates"
**Solution:** Ensure customer addresses have valid latitude/longitude

---

## Success Criteria

All tests should pass with:
- ✅ Status 200/201 for successful operations
- ✅ Status 400 for validation errors
- ✅ Status 401 for unauthorized access
- ✅ Status 403 for forbidden access
- ✅ Status 404 for not found errors
- ✅ Status 409 for conflicts
- ✅ Proper JSON responses with success/error flags
- ✅ Database records created/updated correctly
- ✅ GPS tracking data recorded
- ✅ Route optimization working
- ✅ Driver authentication working

---

## Next Steps After Testing

1. Review all test results
2. Document any issues found
3. Create bug reports if needed
4. Proceed with frontend integration
5. Develop driver mobile app
6. Configure real GPS provider (if ready)

---

**Testing Guide Version:** 1.0
**Last Updated:** October 17, 2025
