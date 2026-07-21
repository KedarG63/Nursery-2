/**
 * Finance Controller
 *
 * Read-only, additive aggregations that give the owner one place to see the
 * whole money picture:
 *
 *   GET /api/finance/overview     — balances, money in/out for a window,
 *                                   receivables, payables, staff advances
 *   GET /api/finance/profit-loss  — P&L for a date range: income (sales +
 *                                   service) vs costs (purchases, expenses by
 *                                   category, payroll), with a monthly series
 *
 * Writes nothing. Internal cash→bank deposits (source_type='cash_deposit')
 * are excluded from money in/out so transfers don't inflate the flows.
 */

const db = require('../utils/db');
const { computeBalance: cashBalance } = require('./cashLedgerController');
const { computeBalance: bankBalance } = require('./bankLedgerController');

const num = (v) => parseFloat(v || 0);
const round2 = (v) => parseFloat(num(v).toFixed(2));
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Default window = current calendar month.
function resolveWindow(from_date, to_date) {
  if (from_date && to_date) return { start: from_date, end: to_date };
  const now = new Date();
  return {
    start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

// ─── FINANCE OVERVIEW ─────────────────────────────────────────────────────────
// GET /api/finance/overview?from_date=&to_date=   (defaults to this month)
const getOverview = async (req, res, next) => {
  try {
    const win = resolveWindow(req.query.from_date, req.query.to_date);

    // Account balances (as of today)
    const [cashAccounts, bankAccounts] = await Promise.all([
      db.query(`SELECT id, account_name FROM cash_accounts WHERE is_active = true ORDER BY sort_order, created_at`),
      db.query(`SELECT id, account_name, bank_name FROM bank_accounts WHERE is_active = true ORDER BY sort_order, created_at`),
    ]);

    const cashWithBal = await Promise.all(
      cashAccounts.rows.map(async (a) => ({ ...a, type: 'cash', balance: await cashBalance(a.id) }))
    );
    const bankWithBal = await Promise.all(
      bankAccounts.rows.map(async (a) => ({ ...a, type: 'bank', balance: await bankBalance(a.id) }))
    );

    // Money in / out over the window across cash + bank, excluding internal
    // cash→bank deposits (they'd show as both an out and an in).
    const flowSql = (table) => `
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) AS money_in,
        COALESCE(SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END), 0) AS money_out
      FROM ${table}
      WHERE deleted_at IS NULL
        AND entry_type IN ('credit', 'debit')
        AND source_type IS DISTINCT FROM 'cash_deposit'
        AND entry_date BETWEEN $1 AND $2`;

    // Where the money went, by source (expense / payroll / advance / manual)
    const outBySourceSql = (table) => `
      SELECT COALESCE(source_type, 'manual') AS source_type,
             COALESCE(SUM(amount), 0) AS total
      FROM ${table}
      WHERE deleted_at IS NULL
        AND entry_type = 'debit'
        AND source_type IS DISTINCT FROM 'cash_deposit'
        AND entry_date BETWEEN $1 AND $2
      GROUP BY 1`;

    const [
      cashFlows, bankFlows, cashOutBySource, bankOutBySource,
      receivablesOrders, receivablesService, payablesSeed, payablesSupplies, advances,
    ] = await Promise.all([
      db.query(flowSql('cash_ledger_entries', 'cash_account_id'), [win.start, win.end]),
      db.query(flowSql('bank_ledger_entries', 'bank_account_id'), [win.start, win.end]),
      db.query(outBySourceSql('cash_ledger_entries'), [win.start, win.end]),
      db.query(outBySourceSql('bank_ledger_entries'), [win.start, win.end]),
      db.query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS total, COUNT(*) FILTER (WHERE balance_amount > 0)::int AS count
         FROM orders WHERE deleted_at IS NULL AND status != 'cancelled'`
      ),
      db.query(
        `SELECT COALESCE(SUM(balance_amount), 0) AS total, COUNT(*) FILTER (WHERE balance_amount > 0)::int AS count
         FROM service_orders WHERE deleted_at IS NULL AND status != 'cancelled'`
      ),
      db.query(
        `SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS total,
                COUNT(*) FILTER (WHERE grand_total > amount_paid)::int AS count
         FROM seed_purchases WHERE deleted_at IS NULL`
      ),
      db.query(
        `SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS total,
                COUNT(*) FILTER (WHERE grand_total > amount_paid)::int AS count
         FROM material_purchases WHERE deleted_at IS NULL`
      ),
      db.query(
        `SELECT COALESCE(SUM(amount - amount_recovered), 0) AS total,
                COUNT(*) FILTER (WHERE amount > amount_recovered)::int AS count
         FROM employee_advances WHERE deleted_at IS NULL AND status = 'outstanding'`
      ),
    ]);

    // Merge cash+bank money-out-by-source maps
    const outBySource = {};
    for (const r of [...cashOutBySource.rows, ...bankOutBySource.rows]) {
      outBySource[r.source_type] = round2((outBySource[r.source_type] || 0) + num(r.total));
    }

    const moneyIn = round2(num(cashFlows.rows[0].money_in) + num(bankFlows.rows[0].money_in));
    const moneyOut = round2(num(cashFlows.rows[0].money_out) + num(bankFlows.rows[0].money_out));

    res.json({
      success: true,
      data: {
        window: win,
        accounts: [...cashWithBal, ...bankWithBal],
        totals: {
          cash_in_hand: round2(cashWithBal.reduce((s, a) => s + a.balance, 0)),
          bank_balance: round2(bankWithBal.reduce((s, a) => s + a.balance, 0)),
        },
        flows: {
          money_in: moneyIn,
          money_out: moneyOut,
          net: round2(moneyIn - moneyOut),
          out_by_source: outBySource,
        },
        receivables: {
          orders: round2(receivablesOrders.rows[0].total),
          orders_count: receivablesOrders.rows[0].count,
          service_orders: round2(receivablesService.rows[0].total),
          service_orders_count: receivablesService.rows[0].count,
          total: round2(num(receivablesOrders.rows[0].total) + num(receivablesService.rows[0].total)),
        },
        payables: {
          // Seeds and non-seed supplies are separate registers; show both.
          seed_purchases: round2(payablesSeed.rows[0].total),
          seed_purchases_count: payablesSeed.rows[0].count,
          supplies: round2(payablesSupplies.rows[0].total),
          supplies_count: payablesSupplies.rows[0].count,
          total: round2(num(payablesSeed.rows[0].total) + num(payablesSupplies.rows[0].total)),
          count: payablesSeed.rows[0].count + payablesSupplies.rows[0].count,
        },
        staff_advances: {
          total: round2(advances.rows[0].total),
          count: advances.rows[0].count,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PROFIT & LOSS ────────────────────────────────────────────────────────────
// GET /api/finance/profit-loss?from_date=&to_date=   (defaults to this month)
//
// Income  : product orders (order_date) + service orders (order_date)
// Costs   : seed purchases (purchase_date, less vendor returns),
//           supplies & materials purchases (purchase_date — cocopeat, fertiliser…),
//           operating expenses by category (expense_date),
//           payroll cost = gross - leave deduction of PAID items (paid_at)
//
// Purchases are counted when INCURRED (accrual), not when paid, so a bill you
// have not settled still shows as a cost. Supplies payments post to the cash /
// bank ledger but never to `expenses`, so there is no double count here.
const getProfitLoss = async (req, res, next) => {
  try {
    const win = resolveWindow(req.query.from_date, req.query.to_date);

    const [sales, service, purchases, returns, expensesByCat, payrollAgg, suppliesByCat] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
         FROM orders
         WHERE deleted_at IS NULL AND status != 'cancelled' AND order_date BETWEEN $1 AND $2`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT COALESCE(SUM(service_fee), 0) AS total, COUNT(*)::int AS count
         FROM service_orders
         WHERE deleted_at IS NULL AND status != 'cancelled' AND order_date BETWEEN $1 AND $2`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT COALESCE(SUM(grand_total), 0) AS total, COUNT(*)::int AS count
         FROM seed_purchases
         WHERE deleted_at IS NULL AND purchase_date BETWEEN $1 AND $2`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT COALESCE(SUM(return_amount), 0) AS total
         FROM vendor_return_notes
         WHERE deleted_at IS NULL AND return_date BETWEEN $1 AND $2`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT ec.name AS category, COALESCE(SUM(e.amount + e.tax_amount), 0) AS total, COUNT(e.id)::int AS count
         FROM expenses e
         JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.deleted_at IS NULL AND e.expense_date BETWEEN $1 AND $2
         GROUP BY ec.name
         ORDER BY total DESC`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT COALESCE(SUM(pi.gross_amount - COALESCE(pi.leave_deducted, 0)), 0) AS total,
                COUNT(*)::int AS count
         FROM payroll_items pi
         WHERE pi.status = 'paid' AND pi.paid_at::date BETWEEN $1 AND $2`,
        [win.start, win.end]
      ),
      db.query(
        `SELECT COALESCE(ec.name, 'Uncategorised Supplies') AS category,
                COALESCE(SUM(mp.grand_total), 0) AS total,
                COUNT(mp.id)::int AS count
         FROM material_purchases mp
         LEFT JOIN expense_categories ec ON ec.id = mp.category_id
         WHERE mp.deleted_at IS NULL AND mp.purchase_date BETWEEN $1 AND $2
         GROUP BY 1
         ORDER BY total DESC`,
        [win.start, win.end]
      ),
    ]);

    // Monthly series across the window (income vs costs vs net)
    const monthlySql = `
      WITH months AS (
        SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), '1 month') AS m
      ),
      inc AS (
        SELECT date_trunc('month', order_date) AS m, SUM(total_amount) AS v
        FROM orders WHERE deleted_at IS NULL AND status != 'cancelled' AND order_date BETWEEN $1 AND $2
        GROUP BY 1
      ),
      svc AS (
        SELECT date_trunc('month', order_date) AS m, SUM(service_fee) AS v
        FROM service_orders WHERE deleted_at IS NULL AND status != 'cancelled' AND order_date BETWEEN $1 AND $2
        GROUP BY 1
      ),
      pur AS (
        SELECT date_trunc('month', purchase_date) AS m, SUM(grand_total) AS v
        FROM seed_purchases WHERE deleted_at IS NULL AND purchase_date BETWEEN $1 AND $2
        GROUP BY 1
      ),
      sup AS (
        SELECT date_trunc('month', purchase_date) AS m, SUM(grand_total) AS v
        FROM material_purchases WHERE deleted_at IS NULL AND purchase_date BETWEEN $1 AND $2
        GROUP BY 1
      ),
      exp AS (
        SELECT date_trunc('month', expense_date) AS m, SUM(amount + tax_amount) AS v
        FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN $1 AND $2
        GROUP BY 1
      ),
      pay AS (
        SELECT date_trunc('month', paid_at) AS m, SUM(gross_amount - COALESCE(leave_deducted, 0)) AS v
        FROM payroll_items WHERE status = 'paid' AND paid_at::date BETWEEN $1 AND $2
        GROUP BY 1
      )
      SELECT
        TO_CHAR(months.m, 'YYYY-MM') AS month_key,
        COALESCE(inc.v, 0) + COALESCE(svc.v, 0) AS income,
        COALESCE(pur.v, 0) + COALESCE(sup.v, 0) + COALESCE(exp.v, 0) + COALESCE(pay.v, 0) AS costs
      FROM months
      LEFT JOIN inc ON inc.m = months.m
      LEFT JOIN svc ON svc.m = months.m
      LEFT JOIN pur ON pur.m = months.m
      LEFT JOIN sup ON sup.m = months.m
      LEFT JOIN exp ON exp.m = months.m
      LEFT JOIN pay ON pay.m = months.m
      ORDER BY months.m`;

    const monthly = await db.query(monthlySql, [win.start, win.end]);

    const income = {
      product_sales: round2(sales.rows[0].total),
      product_sales_count: sales.rows[0].count,
      service_income: round2(service.rows[0].total),
      service_income_count: service.rows[0].count,
    };
    income.total = round2(income.product_sales + income.service_income);

    const totalExpenses = round2(expensesByCat.rows.reduce((s, r) => s + num(r.total), 0));
    const totalSupplies = round2(suppliesByCat.rows.reduce((s, r) => s + num(r.total), 0));
    const costs = {
      purchases: round2(purchases.rows[0].total),
      purchases_count: purchases.rows[0].count,
      vendor_returns: round2(returns.rows[0].total), // reduces purchase cost
      supplies_total: totalSupplies,
      supplies_count: suppliesByCat.rows.reduce((s, r) => s + r.count, 0),
      supplies_by_category: suppliesByCat.rows.map((r) => ({
        category: r.category,
        total: round2(r.total),
        count: r.count,
      })),
      expenses_total: totalExpenses,
      expenses_by_category: expensesByCat.rows.map((r) => ({
        category: r.category,
        total: round2(r.total),
        count: r.count,
      })),
      payroll: round2(payrollAgg.rows[0].total),
      payroll_count: payrollAgg.rows[0].count,
    };
    costs.total = round2(
      costs.purchases - costs.vendor_returns + costs.supplies_total + costs.expenses_total + costs.payroll
    );

    const netProfit = round2(income.total - costs.total);

    res.json({
      success: true,
      data: {
        window: win,
        income,
        costs,
        net_profit: netProfit,
        margin_pct: income.total > 0 ? round2((netProfit / income.total) * 100) : 0,
        monthly: monthly.rows.map((r) => ({
          month_key: r.month_key,
          income: round2(r.income),
          costs: round2(r.costs),
          net: round2(num(r.income) - num(r.costs)),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOverview, getProfitLoss };
