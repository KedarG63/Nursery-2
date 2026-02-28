#!/usr/bin/env python3
"""
Phase 7 Payment System Testing Script
Tests all payment endpoints with proper JSON handling
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:5000/api"

def print_section(title):
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}\n")

def print_result(name, response):
    print(f"{name}:")
    print(f"  Status: {response.status_code}")
    try:
        print(f"  Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"  Response: {response.text}")
    print()

print_section("Phase 7 Payment System Testing")

# Step 1: Login
print("1. Logging in...")
login_response = requests.post(
    f"{BASE_URL}/auth/login",
    json={"email": "test.payment@nursery.com", "password": "Test@1234"}
)

if login_response.status_code != 200:
    print("ERROR: Login failed")
    print(login_response.text)
    exit(1)

token = login_response.json()["tokens"]["accessToken"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("✓ Logged in successfully\n")

# Step 2: Create Customer
print("2. Creating customer...")
customer_response = requests.post(
    f"{BASE_URL}/customers",
    headers=headers,
    json={
        "companyName": f"Payment Test Customer {datetime.now().strftime('%H%M%S')}",
        "contactPerson": "Test User",
        "email": f"test{datetime.now().timestamp()}@example.com",
        "phone": "9876543210",
        "creditLimit": 100000,
        "paymentTerms": 30
    }
)

customer_id = customer_response.json().get("customer", {}).get("id")
print(f"✓ Customer ID: {customer_id}\n")

# Step 3: Create Order
print("3. Creating order...")
order_response = requests.post(
    f"{BASE_URL}/orders",
    headers=headers,
    json={
        "customerId": customer_id,
        "orderType": "direct_sale",
        "deliveryType": "delivery",
        "items": [],
        "notes": "Payment test order"
    }
)

order_data = order_response.json()
order_id = order_data.get("order", {}).get("id")
print(f"✓ Order ID: {order_id}")

# Update order totals directly in DB
import subprocess
subprocess.run([
    "psql",
    "postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software",
    "-c", f"UPDATE orders SET total_amount = 10000, balance_amount = 10000 WHERE id = '{order_id}';"
], capture_output=True)
print("✓ Order total set to ₹10,000\n")

print_section("Testing Payment Endpoints")

# TEST 1: Initiate Online Payment
print("TEST 1: Initiate Online Payment (UPI - ₹3,000)")
print("-" * 60)
initiate_response = requests.post(
    f"{BASE_URL}/payments/initiate",
    headers=headers,
    json={
        "orderId": order_id,
        "amount": 3000,
        "paymentMethod": "upi"
    }
)
print_result("Initiate Payment", initiate_response)

payment_data = initiate_response.json() if initiate_response.status_code == 200 else {}
payment_id = payment_data.get("paymentId")
gateway_order_id = payment_data.get("gatewayOrderId")

# TEST 2: Verify Payment
if gateway_order_id:
    print("TEST 2: Verify Payment")
    print("-" * 60)
    verify_response = requests.post(
        f"{BASE_URL}/payments/verify",
        headers=headers,
        json={
            "orderId": gateway_order_id,
            "paymentId": "mock_payment_success",
            "signature": "mock_signature_valid"
        }
    )
    print_result("Verify Payment", verify_response)

# TEST 3: Record Offline Payment
print("TEST 3: Record Offline Payment (Cash - ₹2,000)")
print("-" * 60)
cash_response = requests.post(
    f"{BASE_URL}/payments/record",
    headers=headers,
    json={
        "orderId": order_id,
        "amount": 2000,
        "paymentMethod": "cash",
        "receiptNumber": f"CASH-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "notes": "Cash payment test"
    }
)
print_result("Record Cash Payment", cash_response)

# TEST 4: Get Order Payments
print("TEST 4: Get Order Payments")
print("-" * 60)
order_payments_response = requests.get(
    f"{BASE_URL}/payments/order/{order_id}",
    headers=headers
)
print_result("Order Payments", order_payments_response)

# TEST 5: Get Customer Payment History
print("TEST 5: Get Customer Payment History")
print("-" * 60)
history_response = requests.get(
    f"{BASE_URL}/payments/customer/{customer_id}?page=1&limit=10",
    headers=headers
)
print_result("Payment History", history_response)

# TEST 6: Check order amounts updated
print("TEST 6: Verify Order Amounts Updated by Triggers")
print("-" * 60)
result = subprocess.run([
    "psql",
    "postgresql://postgres:Chikney%402021@localhost:5432/Nursery_management_software",
    "-t", "-c",
    f"SELECT total_amount, paid_amount, balance_amount FROM orders WHERE id = '{order_id}';"
], capture_output=True, text=True)
print(f"Order Amounts: {result.stdout.strip()}")
print()

# TEST 7: Process Refund
if payment_id:
    print("TEST 7: Process Refund (₹500)")
    print("-" * 60)
    refund_response = requests.post(
        f"{BASE_URL}/payments/refund",
        headers=headers,
        json={
            "paymentId": payment_id,
            "amount": 500,
            "reason": "Test partial refund"
        }
    )
    print_result("Process Refund", refund_response)

print_section("✓ Phase 7 Testing Complete!")
print(f"Order ID: {order_id}")
print(f"Customer ID: {customer_id}")
print(f"Payment ID: {payment_id}")
