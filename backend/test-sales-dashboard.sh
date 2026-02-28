#!/bin/bash
# Test Sales Dashboard API

echo "=== Testing Sales Report API ==="
echo ""
echo "Step 1: Login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nursery.com","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✓ Login successful"
echo ""

echo "Step 2: Fetching sales report (last 30 days)..."
REPORT_RESPONSE=$(curl -s -X GET "http://localhost:5000/api/reports/sales?start_date=2025-07-01&end_date=2025-11-30&group_by=day" \
  -H "Authorization: Bearer $TOKEN")

echo "$REPORT_RESPONSE" | head -50
echo ""

# Check if data exists
if echo "$REPORT_RESPONSE" | grep -q '"revenueTrend"'; then
  TREND_COUNT=$(echo "$REPORT_RESPONSE" | grep -o '"revenueTrend":\[[^]]*\]' | wc -c)
  if [ "$TREND_COUNT" -gt 20 ]; then
    echo "✓ Revenue trend data found!"
  else
    echo "⚠️  Revenue trend array is empty"
  fi
else
  echo "❌ No revenueTrend in response"
fi
