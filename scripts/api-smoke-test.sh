#!/usr/bin/env bash
# =============================================================================
# Read-only API smoke test for the Nursery Management System.
#
# Hits every GET endpoint plus the payroll preview (which the controller
# documents as "compute, no writes"). It performs NO create/update/delete
# calls, so it is safe to run against production.
#
# Usage:
#   export NURSERY_EMAIL='you@example.com'
#   read -rsp 'Password: ' NURSERY_PASSWORD; echo; export NURSERY_PASSWORD
#   bash api-smoke-test.sh                      # against production
#   BASE=http://localhost:5000 bash api-smoke-test.sh   # against a local stack
# =============================================================================

set -uo pipefail

BASE="${BASE:-https://internal.vasundharaseedlings.com}"
EMAIL="${NURSERY_EMAIL:-}"
PASSWORD="${NURSERY_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Set NURSERY_EMAIL and NURSERY_PASSWORD first." >&2
  exit 1
fi

PASS=0; FAIL=0; SKIP=0
FAILED_LIST=()

echo "=== Nursery API smoke test ==="
echo "Target: $BASE"
echo

# ── Login ────────────────────────────────────────────────────────────────────
LOGIN_BODY=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(printf '%s' "$LOGIN_BODY" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

if [[ -z "$TOKEN" ]]; then
  echo "LOGIN FAILED. Response:" >&2
  printf '%s\n' "$LOGIN_BODY" >&2
  exit 1
fi
echo "Login OK (token acquired)"
echo

AUTH="Authorization: Bearer $TOKEN"

# check <METHOD> <PATH> [JSON_BODY]
check() {
  local method="$1" path="$2" body="${3:-}" code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -o /tmp/smoke_out -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "$AUTH" -H 'Content-Type: application/json' -d "$body")
  else
    code=$(curl -sS -o /tmp/smoke_out -w '%{http_code}' -X "$method" "$BASE$path" -H "$AUTH")
  fi
  if [[ "$code" =~ ^2 ]]; then
    printf '  \033[32mPASS\033[0m %-3s %-52s %s\n' "$method" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf '  \033[31mFAIL\033[0m %-3s %-52s %s\n' "$method" "$path" "$code"
    echo "        -> $(head -c 300 /tmp/smoke_out)"
    FAIL=$((FAIL+1)); FAILED_LIST+=("$method $path -> $code")
  fi
}

# first_id <PATH> — pull the first "id" out of a list response
first_id() {
  curl -sS "$BASE$1" -H "$AUTH" \
    | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1
}

section() { echo; echo "── $1 ──"; }

section "Health"
# Mounted at /health, NOT /api/health (server.js: app.use('/health', ...)).
check GET /health
check GET /health/detailed
check GET /health/ready
check GET /health/live

section "Auth & users"
check GET /api/auth/profile
check GET /api/users

section "Dashboard"
check GET /api/dashboard/overview
check GET /api/dashboard/kpis
check GET /api/dashboard/recent-orders

section "Catalogue"
check GET /api/products
check GET /api/skus
check GET /api/lots

section "Inventory"
for p in summary seeds saplings combined seeds/available-for-lot stats; do
  check GET "/api/inventory/$p"
done

section "Customers / orders / payments"
check GET /api/customers
check GET /api/orders
check GET /api/orders/recent
check GET /api/payments
check GET /api/payments/summary
check GET /api/payments/upcoming

section "Purchasing & billing"
check GET /api/vendors
check GET /api/purchases
check GET /api/material-purchases
check GET /api/material-purchases/summary
check GET /api/invoices
check GET /api/vendor-bills
check GET /api/vendor-returns

section "Delivery"
check GET /api/delivery
check GET /api/routes
check GET /api/vehicles

section "Reports"
for r in sales inventory delivery customers financial varieties; do
  check GET "/api/reports/$r"
done

section "Accounting — CHANGED AREA (bank sync)"
check GET /api/bank-accounts
check GET /api/cash-accounts
check GET /api/expenses
check GET /api/expenses/categories
check GET /api/expenses/summary
check GET /api/fund-transfers
check GET /api/finance/overview
check GET /api/finance/profit-loss

BANK_ID=$(first_id /api/bank-accounts)
if [[ -n "$BANK_ID" ]]; then
  check GET "/api/bank-accounts/$BANK_ID/ledger"
  # The summary endpoint requires an explicit financial year (Apr-Mar).
  FY_START=$(date +%-m); FY_YEAR=$(date +%Y)
  if [ "$FY_START" -lt 4 ]; then FY_YEAR=$((FY_YEAR - 1)); fi
  check GET "/api/bank-accounts/$BANK_ID/summary?financial_year=${FY_YEAR}-$(printf '%02d' $(( (FY_YEAR + 1) % 100 )))"
else
  echo "  SKIP bank ledger (no bank accounts)"; SKIP=$((SKIP+1))
fi

CASH_ID=$(first_id /api/cash-accounts)
if [[ -n "$CASH_ID" ]]; then
  check GET "/api/cash-accounts/$CASH_ID/ledger"
else
  echo "  SKIP cash ledger (no cash accounts)"; SKIP=$((SKIP+1))
fi

section "Payroll — CHANGED AREA (half_day_rate + joining date)"
check GET /api/employees
check GET /api/advances
check GET /api/payroll/runs
# Attendance roster now selects e.half_day_rate — 500 here means the migration
# has not been applied yet.
check GET "/api/attendance?work_date=$(date +%F)"

# computePreview now selects half_day_rate and filters on date_of_joining.
# A 500 here means migration 1769000000013 has not run.
check POST /api/payroll/runs/preview \
  "{\"run_type\":\"salary\",\"period_month\":$(date +%-m),\"period_year\":$(date +%Y)}"
WEEK_AGO=$(date -d '7 days ago' +%F 2>/dev/null || date -v-7d +%F 2>/dev/null || date +%F)
check POST /api/payroll/runs/preview \
  "{\"run_type\":\"wages\",\"from_date\":\"$WEEK_AGO\",\"to_date\":\"$(date +%F)\"}"

EMP_ID=$(first_id /api/employees)
if [[ -n "$EMP_ID" ]]; then
  check GET "/api/employees/$EMP_ID"
  check GET "/api/employees/$EMP_ID/summary"
else
  echo "  SKIP employee detail (no employees)"; SKIP=$((SKIP+1))
fi

section "Misc"
check GET /api/notifications
check GET /api/notifications/unread-count
check GET /api/service-orders
check GET /api/trash

# ── Summary ──────────────────────────────────────────────────────────────────
echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
echo "==================================="
if (( FAIL > 0 )); then
  echo
  echo "Failures:"
  printf '  %s\n' "${FAILED_LIST[@]}"
  exit 1
fi
echo "All checked endpoints returned 2xx."
