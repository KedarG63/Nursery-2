#!/bin/bash

# Phase 7 Payment System Testing Script
# Tests all payment endpoints with mock provider

BASE_URL="http://localhost:5000"
API_URL="$BASE_URL/api"

echo "================================"
echo "Phase 7 Payment System Testing"
echo "================================"
echo ""

# Step 1: Register a test user
echo "1. Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.payment@nursery.com",
    "password": "Test@1234",
    "fullName": "Payment Test User"
  }')

echo "Registration response: $REGISTER_RESPONSE"
echo ""

# Step 2: Login
echo "2. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.payment@nursery.com",
    "password": "Test@1234"
  }')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
echo "Access Token: ${ACCESS_TOKEN:0:50}..."
echo ""

if [ -z "$ACCESS_TOKEN" ]; then
  echo "ERROR: Failed to get access token"
  exit 1
fi

# Step 3: Create a customer
echo "3. Creating test customer..."
CUSTOMER_RESPONSE=$(curl -s -X POST "$API_URL/customers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "companyName": "Test Nursery Ltd",
    "contactPerson": "John Doe",
    "email": "customer@test.com",
    "phone": "9876543210",
    "gstNumber": "29ABCDE1234F1Z5",
    "creditLimit": 100000,
    "paymentTerms": 30
  }')

CUSTOMER_ID=$(echo $CUSTOMER_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Customer ID: $CUSTOMER_ID"
echo ""

if [ -z "$CUSTOMER_ID" ]; then
  echo "ERROR: Failed to create customer"
  echo "Response: $CUSTOMER_RESPONSE"
  exit 1
fi

# Step 4: Create an order
echo "4. Creating test order..."
ORDER_RESPONSE=$(curl -s -X POST "$API_URL/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"orderType\": \"direct_sale\",
    \"deliveryType\": \"delivery\",
    \"items\": [],
    \"notes\": \"Test order for payment testing\"
  }")

ORDER_ID=$(echo $ORDER_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "Order ID: $ORDER_ID"
echo ""

if [ -z "$ORDER_ID" ]; then
  echo "ERROR: Failed to create order"
  echo "Response: $ORDER_RESPONSE"
  exit 1
fi

# Manually update order total for testing
echo "5. Updating order total manually..."
psql postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software -c "UPDATE orders SET total_amount = 10000, balance_amount = 10000 WHERE id = '$ORDER_ID';"
echo ""

echo "================================"
echo "Testing Payment Endpoints"
echo "================================"
echo ""

# Test 1: Initiate Online Payment
echo "TEST 1: Initiate Online Payment"
echo "-------------------------------"
INITIATE_RESPONSE=$(curl -s -X POST "$API_URL/payments/initiate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 3000,
    \"paymentMethod\": \"upi\"
  }")

echo "Response: $INITIATE_RESPONSE"
PAYMENT_ID=$(echo $INITIATE_RESPONSE | grep -o '"paymentId":"[^"]*' | cut -d'"' -f4)
GATEWAY_ORDER_ID=$(echo $INITIATE_RESPONSE | grep -o '"gatewayOrderId":"[^"]*' | cut -d'"' -f4)
echo "Payment ID: $PAYMENT_ID"
echo "Gateway Order ID: $GATEWAY_ORDER_ID"
echo ""

# Test 2: Verify Payment
echo "TEST 2: Verify Payment"
echo "----------------------"
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/payments/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"orderId\": \"$GATEWAY_ORDER_ID\",
    \"paymentId\": \"mock_payment_success\",
    \"signature\": \"mock_signature_valid\"
  }")

echo "Response: $VERIFY_RESPONSE"
echo ""

# Test 3: Record Offline Payment
echo "TEST 3: Record Offline Payment (Cash)"
echo "--------------------------------------"
OFFLINE_RESPONSE=$(curl -s -X POST "$API_URL/payments/record" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 2000,
    \"paymentMethod\": \"cash\",
    \"receiptNumber\": \"RCPT-001\",
    \"notes\": \"Cash payment received\"
  }")

echo "Response: $OFFLINE_RESPONSE"
echo ""

# Test 4: Get Order Payments
echo "TEST 4: Get Order Payments"
echo "--------------------------"
ORDER_PAYMENTS=$(curl -s -X GET "$API_URL/payments/order/$ORDER_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "Response: $ORDER_PAYMENTS"
echo ""

# Test 5: Get Customer Payment History
echo "TEST 5: Get Customer Payment History"
echo "-------------------------------------"
CUSTOMER_PAYMENTS=$(curl -s -X GET "$API_URL/payments/customer/$CUSTOMER_ID?page=1&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "Response: $CUSTOMER_PAYMENTS"
echo ""

# Test 6: Process Refund
echo "TEST 6: Process Refund"
echo "----------------------"
if [ ! -z "$PAYMENT_ID" ]; then
  REFUND_RESPONSE=$(curl -s -X POST "$API_URL/payments/refund" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{
      \"paymentId\": \"$PAYMENT_ID\",
      \"amount\": 500,
      \"reason\": \"Partial refund for testing\"
    }")

  echo "Response: $REFUND_RESPONSE"
else
  echo "Skipped - No payment ID available"
fi
echo ""

# Test 7: Verify Database Triggers
echo "TEST 7: Verify Database Triggers"
echo "---------------------------------"
echo "Checking order paid_amount was updated..."
ORDER_CHECK=$(psql postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software -t -c "SELECT paid_amount, balance_amount FROM orders WHERE id = '$ORDER_ID';")
echo "Order amounts: $ORDER_CHECK"
echo ""

echo "================================"
echo "Phase 7 Testing Complete!"
echo "================================"
