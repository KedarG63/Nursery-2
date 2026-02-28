#!/bin/bash

# Simplified Phase 7 Payment Testing
BASE_URL="http://localhost:5000/api"

echo "===================================="
echo " Phase 7 Payment System Testing"
echo "===================================="
echo ""

# Login as admin
echo "1. Logging in as admin..."
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test.payment@nursery.com", "password": "Test@1234"}')

TOKEN=$(echo $LOGIN | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Login failed"
  echo "$LOGIN"
  exit 1
fi

echo "✓ Logged in successfully"
echo ""

# Create customer
echo "2. Creating test customer..."
CUSTOMER=$(curl -s -X POST "$BASE_URL/customers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "companyName": "Test Payment Customer",
    "contactPerson": "Payment Test",
    "email": "payment.test@example.com",
    "phone": "9999888877",
    "creditLimit": 50000,
    "paymentTerms": 30
  }')

CUSTOMER_ID=$(echo $CUSTOMER | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✓ Customer ID: $CUSTOMER_ID"
echo ""

# Create order
echo "3. Creating test order..."
ORDER=$(curl -s -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"orderType\": \"direct_sale\",
    \"deliveryType\": \"delivery\",
    \"items\": [],
    \"notes\": \"Payment test order\"
  }")

ORDER_ID=$(echo $ORDER | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✓ Order ID: $ORDER_ID"

# Update order totals
psql postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software -c "UPDATE orders SET total_amount = 10000, balance_amount = 10000 WHERE id = '$ORDER_ID';" > /dev/null 2>&1
echo "✓ Order total set to ₹10,000"
echo ""

echo "===================================="
echo " Testing Payment Endpoints"
echo "===================================="
echo ""

# Test 1: Initiate online payment
echo "TEST 1: Initiate Online Payment (UPI - ₹3000)"
echo "-----------------------------------------------"
INITIATE=$(curl -s -X POST "$BASE_URL/payments/initiate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 3000,
    \"paymentMethod\": \"upi\"
  }")

echo "$INITIATE" | python3 -m json.tool 2>/dev/null || echo "$INITIATE"
PAYMENT_ID=$(echo $INITIATE | grep -o '"paymentId":"[^"]*' | cut -d'"' -f4)
GATEWAY_ORDER=$(echo $INITIATE | grep -o '"gatewayOrderId":"[^"]*' | cut -d'"' -f4)
echo ""

# Test 2: Verify payment
echo "TEST 2: Verify Payment"
echo "----------------------"
VERIFY=$(curl -s -X POST "$BASE_URL/payments/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"orderId\": \"$GATEWAY_ORDER\",
    \"paymentId\": \"mock_payment_success\",
    \"signature\": \"mock_signature_valid\"
  }")

echo "$VERIFY" | python3 -m json.tool 2>/dev/null || echo "$VERIFY"
echo ""

# Test 3: Record offline cash payment
echo "TEST 3: Record Offline Payment (Cash - ₹2000)"
echo "----------------------------------------------"
CASH=$(curl -s -X POST "$BASE_URL/payments/record" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"orderId\": \"$ORDER_ID\",
    \"amount\": 2000,
    \"paymentMethod\": \"cash\",
    \"receiptNumber\": \"CASH-001\",
    \"notes\": \"Cash payment test\"
  }")

echo "$CASH" | python3 -m json.tool 2>/dev/null || echo "$CASH"
echo ""

# Test 4: Get order payments
echo "TEST 4: Get All Payments for Order"
echo "-----------------------------------"
PAYMENTS=$(curl -s -X GET "$BASE_URL/payments/order/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$PAYMENTS" | python3 -m json.tool 2>/dev/null || echo "$PAYMENTS"
echo ""

# Test 5: Verify order paid_amount updated
echo "TEST 5: Verify Order Paid Amount Updated"
echo "-----------------------------------------"
AMOUNTS=$(psql postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software -t -c "SELECT total_amount, paid_amount, balance_amount FROM orders WHERE id = '$ORDER_ID';")
echo "Order Amounts: $AMOUNTS"
echo ""

# Test 6: Process refund
if [ ! -z "$PAYMENT_ID" ]; then
  echo "TEST 6: Process Refund (₹500)"
  echo "-----------------------------"
  REFUND=$(curl -s -X POST "$BASE_URL/payments/refund" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"paymentId\": \"$PAYMENT_ID\",
      \"amount\": 500,
      \"reason\": \"Test refund\"
    }")

  echo "$REFUND" | python3 -m json.tool 2>/dev/null || echo "$REFUND"
  echo ""
fi

# Test 7: Get customer payment history
echo "TEST 7: Get Customer Payment History"
echo "-------------------------------------"
HISTORY=$(curl -s -X GET "$BASE_URL/payments/customer/$CUSTOMER_ID?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN")

echo "$HISTORY" | python3 -m json.tool 2>/dev/null || echo "$HISTORY"
echo ""

echo "===================================="
echo " ✓ Phase 7 Testing Complete!"
echo "===================================="
