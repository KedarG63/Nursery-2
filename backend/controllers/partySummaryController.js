/**
 * Party 360° Summary Controller
 *
 * Read-only aggregations for "click a customer / vendor / employee and see all
 * business with them" — windowed by year / month / week.
 *
 * period = 'year' | 'month' | 'week' (default 'month'); date = reference date
 * (default today). Returns headline totals for the window, a zero-filled
 * time-series (year→by month, month/week→by day) and recent transactions.
 *
 * Purely additive — aggregates existing tables, writes nothing.
 */

const pool = require('../config/database');

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Build the time window + sub-buckets for the requested period.
function buildWindow(period, dateStr) {
  const ref = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const buckets = [];
  let start, end, grain;

  if (period === 'year') {
    const y = ref.getFullYear();
    start = `${y}-01-01`; end = `${y}-12-31`; grain = 'month';
    for (let m = 0; m < 12; m++) {
      buckets.push({ key: `${y}-${pad(m + 1)}-01`, label: new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' }) });
    }
  } else if (period === 'week') {
    const d = new Date(ref);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    const monday = new Date(d);
    grain = 'day';
    start = fmt(monday);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); end = fmt(sunday);
    for (let i = 0; i < 7; i++) {
      const dd = new Date(monday); dd.setDate(monday.getDate() + i);
      buckets.push({ key: fmt(dd), label: dd.toLocaleDateString('en-IN', { weekday: 'short' }) });
    }
  } else { // month (default)
    const y = ref.getFullYear(); const m = ref.getMonth();
    const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0);
    grain = 'day';
    start = fmt(first); end = fmt(last);
    for (let i = 1; i <= last.getDate(); i++) {
      buckets.push({ key: `${y}-${pad(m + 1)}-${pad(i)}`, label: String(i) });
    }
  }
  return { start, end, grain, buckets, period: period || 'month' };
}

// grain is from our own code (never user input) — safe to interpolate.
const safeGrain = (g) => (g === 'month' ? 'month' : 'day');

// Merge a SQL series ({k, ...metrics}) into the zero-filled bucket list.
function fillSeries(buckets, rows, metrics) {
  const map = new Map(rows.map((r) => [r.k, r]));
  return buckets.map((b) => {
    const r = map.get(b.key);
    const out = { period: b.label, key: b.key };
    for (const m of metrics) out[m] = r ? parseFloat(r[m] || 0) : 0;
    return out;
  });
}

// ─── CUSTOMER ─────────────────────────────────────────────────────────────────
const customerSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const win = buildWindow(req.query.period, req.query.date);
    const g = safeGrain(win.grain);

    const cust = await pool.query(`SELECT id, name FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (cust.rows.length === 0) return res.status(404).json({ success: false, message: 'Customer not found' });

    const [headline, ordersSeries, paymentsSeries, allTime, recentOrders, recentPayments] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(total_amount),0) AS ordered,
                COALESCE(SUM(paid_amount),0) AS paid,
                COALESCE(SUM(balance_amount),0) AS balance
         FROM orders
         WHERE customer_id = $1 AND deleted_at IS NULL AND status != 'cancelled'
           AND order_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', order_date), 'YYYY-MM-DD') AS k,
                COALESCE(SUM(total_amount),0) AS ordered
         FROM orders
         WHERE customer_id = $1 AND deleted_at IS NULL AND status != 'cancelled'
           AND order_date BETWEEN $2 AND $3
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', COALESCE(payment_date, created_at)), 'YYYY-MM-DD') AS k,
                COALESCE(SUM(amount),0) AS paid
         FROM payments
         WHERE customer_id = $1 AND deleted_at IS NULL AND status = 'success'
           AND COALESCE(payment_date, created_at) BETWEEN $2 AND ($3::date + 1)
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(balance_amount),0) AS total_outstanding
         FROM orders WHERE customer_id = $1 AND deleted_at IS NULL AND status != 'cancelled'`,
        [id]
      ),
      pool.query(
        `SELECT order_number AS ref, order_date AS date, total_amount AS amount, status
         FROM orders WHERE customer_id = $1 AND deleted_at IS NULL AND order_date BETWEEN $2 AND $3
         ORDER BY order_date DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(receipt_number, transaction_id) AS ref, COALESCE(payment_date, created_at)::date AS date,
                amount, payment_method
         FROM payments WHERE customer_id = $1 AND deleted_at IS NULL AND status = 'success'
           AND COALESCE(payment_date, created_at) BETWEEN $2 AND ($3::date + 1)
         ORDER BY COALESCE(payment_date, created_at) DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
    ]);

    // Merge order + payment series on the bucket key
    const oMap = new Map(ordersSeries.rows.map((r) => [r.k, r]));
    const pMap = new Map(paymentsSeries.rows.map((r) => [r.k, r]));
    const series = win.buckets.map((b) => ({
      period: b.label, key: b.key,
      ordered: oMap.has(b.key) ? parseFloat(oMap.get(b.key).ordered) : 0,
      paid: pMap.has(b.key) ? parseFloat(pMap.get(b.key).paid) : 0,
    }));

    const transactions = [
      ...recentOrders.rows.map((r) => ({ type: 'order', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.status })),
      ...recentPayments.rows.map((r) => ({ type: 'payment', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.payment_method })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    const h = headline.rows[0];
    res.json({
      success: true,
      data: {
        party: cust.rows[0],
        period: win.period, window: { start: win.start, end: win.end },
        headline: {
          order_count: h.order_count,
          ordered: parseFloat(h.ordered),
          paid: parseFloat(h.paid),
          balance: parseFloat(h.balance),
          total_outstanding: parseFloat(allTime.rows[0].total_outstanding),
        },
        series,
        transactions,
      },
    });
  } catch (error) {
    console.error('Error in customerSummary:', error);
    res.status(500).json({ success: false, message: 'Failed to load customer summary', error: error.message });
  }
};

// ─── VENDOR ───────────────────────────────────────────────────────────────────
const vendorSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const win = buildWindow(req.query.period, req.query.date);
    const g = safeGrain(win.grain);

    const vendor = await pool.query(`SELECT id, vendor_name FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (vendor.rows.length === 0) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const [headline, purchaseSeries, paySeries, allTime, returnsAgg, expensesAgg, recentPurch, recentPays, recentExp] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS purchase_count,
                COALESCE(SUM(grand_total),0) AS purchased,
                COALESCE(SUM(amount_paid),0) AS paid
         FROM seed_purchases
         WHERE vendor_id = $1 AND deleted_at IS NULL AND purchase_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', purchase_date), 'YYYY-MM-DD') AS k,
                COALESCE(SUM(grand_total),0) AS purchased
         FROM seed_purchases WHERE vendor_id = $1 AND deleted_at IS NULL AND purchase_date BETWEEN $2 AND $3
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', spp.payment_date), 'YYYY-MM-DD') AS k,
                COALESCE(SUM(spp.amount),0) AS paid
         FROM seed_purchase_payments spp
         JOIN seed_purchases sp ON sp.id = spp.seed_purchase_id
         WHERE sp.vendor_id = $1 AND spp.payment_date BETWEEN $2 AND $3
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(grand_total - amount_paid),0) AS total_outstanding
         FROM seed_purchases WHERE vendor_id = $1 AND deleted_at IS NULL`,
        [id]
      ),
      pool.query(
        `SELECT COALESCE(SUM(return_amount),0) AS returns
         FROM vendor_return_notes WHERE vendor_id = $1 AND deleted_at IS NULL AND return_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount + tax_amount),0) AS expenses, COUNT(*)::int AS expense_count
         FROM expenses WHERE vendor_id = $1 AND deleted_at IS NULL AND expense_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT purchase_number AS ref, purchase_date AS date, grand_total AS amount, payment_status AS detail
         FROM seed_purchases WHERE vendor_id = $1 AND deleted_at IS NULL AND purchase_date BETWEEN $2 AND $3
         ORDER BY purchase_date DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT spp.transaction_reference AS ref, spp.payment_date AS date, spp.amount, spp.payment_method AS detail
         FROM seed_purchase_payments spp JOIN seed_purchases sp ON sp.id = spp.seed_purchase_id
         WHERE sp.vendor_id = $1 AND spp.payment_date BETWEEN $2 AND $3
         ORDER BY spp.payment_date DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT expense_number AS ref, expense_date AS date, (amount + tax_amount) AS amount, description AS detail
         FROM expenses WHERE vendor_id = $1 AND deleted_at IS NULL AND expense_date BETWEEN $2 AND $3
         ORDER BY expense_date DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
    ]);

    const pMap = new Map(purchaseSeries.rows.map((r) => [r.k, r]));
    const payMap = new Map(paySeries.rows.map((r) => [r.k, r]));
    const series = win.buckets.map((b) => ({
      period: b.label, key: b.key,
      purchased: pMap.has(b.key) ? parseFloat(pMap.get(b.key).purchased) : 0,
      paid: payMap.has(b.key) ? parseFloat(payMap.get(b.key).paid) : 0,
    }));

    const transactions = [
      ...recentPurch.rows.map((r) => ({ type: 'purchase', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.detail })),
      ...recentPays.rows.map((r) => ({ type: 'payment', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.detail })),
      ...recentExp.rows.map((r) => ({ type: 'expense', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.detail })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    const h = headline.rows[0];
    res.json({
      success: true,
      data: {
        party: { id: vendor.rows[0].id, name: vendor.rows[0].vendor_name },
        period: win.period, window: { start: win.start, end: win.end },
        headline: {
          purchase_count: h.purchase_count,
          purchased: parseFloat(h.purchased),
          paid: parseFloat(h.paid),
          returns: parseFloat(returnsAgg.rows[0].returns),
          expenses: parseFloat(expensesAgg.rows[0].expenses),
          expense_count: expensesAgg.rows[0].expense_count,
          total_outstanding: parseFloat(allTime.rows[0].total_outstanding),
        },
        series,
        transactions,
      },
    });
  } catch (error) {
    console.error('Error in vendorSummary:', error);
    res.status(500).json({ success: false, message: 'Failed to load vendor summary', error: error.message });
  }
};

// ─── EMPLOYEE ─────────────────────────────────────────────────────────────────
const employeeSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const win = buildWindow(req.query.period, req.query.date);
    const g = safeGrain(win.grain);

    const emp = await pool.query(`SELECT id, full_name, employee_type FROM employees WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (emp.rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

    const [payAgg, paySeries, advAgg, advSeries, attAgg, outstanding, recentPay, recentAdv] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS payout_count, COALESCE(SUM(net_amount),0) AS net, COALESCE(SUM(gross_amount),0) AS gross
         FROM payroll_items
         WHERE employee_id = $1 AND status = 'paid' AND paid_at::date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', paid_at), 'YYYY-MM-DD') AS k, COALESCE(SUM(net_amount),0) AS paid
         FROM payroll_items WHERE employee_id = $1 AND status = 'paid' AND paid_at::date BETWEEN $2 AND $3
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS advances
         FROM employee_advances WHERE employee_id = $1 AND deleted_at IS NULL AND advance_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT TO_CHAR(date_trunc('${g}', advance_date), 'YYYY-MM-DD') AS k, COALESCE(SUM(amount),0) AS advance
         FROM employee_advances WHERE employee_id = $1 AND deleted_at IS NULL AND advance_date BETWEEN $2 AND $3
         GROUP BY 1`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(units),0) AS units, COUNT(*) FILTER (WHERE status IN ('present','half_day','paid_leave'))::int AS days
         FROM employee_attendance WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount - amount_recovered),0) AS outstanding_advance
         FROM employee_advances WHERE employee_id = $1 AND status = 'outstanding' AND deleted_at IS NULL`,
        [id]
      ),
      pool.query(
        `SELECT pr.run_number AS ref, pi.paid_at::date AS date, pi.net_amount AS amount, pi.payment_source AS detail
         FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
         WHERE pi.employee_id = $1 AND pi.status = 'paid' AND pi.paid_at::date BETWEEN $2 AND $3
         ORDER BY pi.paid_at DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
      pool.query(
        `SELECT advance_number AS ref, advance_date AS date, amount, status AS detail
         FROM employee_advances WHERE employee_id = $1 AND deleted_at IS NULL AND advance_date BETWEEN $2 AND $3
         ORDER BY advance_date DESC LIMIT 10`,
        [id, win.start, win.end]
      ),
    ]);

    const payMap = new Map(paySeries.rows.map((r) => [r.k, r]));
    const advMap = new Map(advSeries.rows.map((r) => [r.k, r]));
    const series = win.buckets.map((b) => ({
      period: b.label, key: b.key,
      paid: payMap.has(b.key) ? parseFloat(payMap.get(b.key).paid) : 0,
      advance: advMap.has(b.key) ? parseFloat(advMap.get(b.key).advance) : 0,
    }));

    const transactions = [
      ...recentPay.rows.map((r) => ({ type: 'payout', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.detail })),
      ...recentAdv.rows.map((r) => ({ type: 'advance', ref: r.ref, date: r.date, amount: parseFloat(r.amount), detail: r.detail })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    const p = payAgg.rows[0]; const a = attAgg.rows[0];
    res.json({
      success: true,
      data: {
        party: { id: emp.rows[0].id, name: emp.rows[0].full_name, employee_type: emp.rows[0].employee_type },
        period: win.period, window: { start: win.start, end: win.end },
        headline: {
          payout_count: p.payout_count,
          net_paid: parseFloat(p.net),
          gross: parseFloat(p.gross),
          advances_given: parseFloat(advAgg.rows[0].advances),
          outstanding_advance: parseFloat(outstanding.rows[0].outstanding_advance),
          days_worked: parseFloat(a.units),
          days_present: a.days,
        },
        series,
        transactions,
      },
    });
  } catch (error) {
    console.error('Error in employeeSummary:', error);
    res.status(500).json({ success: false, message: 'Failed to load employee summary', error: error.message });
  }
};

module.exports = { customerSummary, vendorSummary, employeeSummary };
