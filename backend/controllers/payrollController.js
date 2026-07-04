/**
 * Payroll Controller — monthly salary runs and daily-wage runs.
 *
 * Flow: preview (compute, no writes) -> create draft run+items -> pay.
 * Paying posts a cash/bank DEBIT per item (net amount, source_type='payroll')
 * and recovers outstanding advances (FIFO) by the per-item advance_deducted.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear, generateDocNumber } = require('../utils/financialYear');
const { postSourceDebit } = require('./expenseController');

const monthLabel = (m, y) =>
  new Date(`${y}-${String(m).padStart(2, '0')}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

// Compute per-employee amounts for a period; no DB writes.
async function computePreview(runner, { period_month, period_year, run_type }) {
  const empType = run_type === 'salary' ? 'salaried' : 'daily_wage';
  const employees = await runner.query(
    `SELECT id, employee_code, full_name, monthly_salary, daily_rate
     FROM employees
     WHERE deleted_at IS NULL AND status = 'active' AND employee_type = $1
     ORDER BY full_name`,
    [empType]
  );

  const items = [];
  for (const e of employees.rows) {
    let gross = 0;
    let days_worked = null;
    if (run_type === 'salary') {
      gross = parseFloat(e.monthly_salary || 0);
    } else {
      const att = await runner.query(
        `SELECT COALESCE(SUM(units), 0) AS units
         FROM employee_attendance
         WHERE employee_id = $1
           AND EXTRACT(MONTH FROM work_date) = $2
           AND EXTRACT(YEAR FROM work_date) = $3`,
        [e.id, period_month, period_year]
      );
      days_worked = parseFloat(att.rows[0].units);
      gross = parseFloat((days_worked * parseFloat(e.daily_rate || 0)).toFixed(2));
    }

    const adv = await runner.query(
      `SELECT COALESCE(SUM(amount - amount_recovered), 0) AS outstanding
       FROM employee_advances
       WHERE employee_id = $1 AND status = 'outstanding' AND deleted_at IS NULL`,
      [e.id]
    );
    const outstanding_advance = parseFloat(adv.rows[0].outstanding);
    const suggested_deduction = Math.min(outstanding_advance, gross);

    items.push({
      employee_id: e.id,
      employee_code: e.employee_code,
      full_name: e.full_name,
      gross_amount: gross,
      days_worked,
      outstanding_advance,
      advance_deducted: parseFloat(suggested_deduction.toFixed(2)),
      net_amount: parseFloat((gross - suggested_deduction).toFixed(2)),
    });
  }
  return items;
}

const previewRun = async (req, res, next) => {
  try {
    const { period_month, period_year, run_type } = req.body;
    if (!period_month || !period_year || !['salary', 'wages'].includes(run_type)) {
      return res.status(400).json({ success: false, message: 'period_month, period_year and a valid run_type are required' });
    }
    const items = await computePreview(db, { period_month, period_year, run_type });
    res.json({
      success: true,
      data: { period_month, period_year, run_type, period_label: monthLabel(period_month, period_year), items },
    });
  } catch (err) {
    next(err);
  }
};

const createRun = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { period_month, period_year, run_type, items, notes } = req.body;
    if (!period_month || !period_year || !['salary', 'wages'].includes(run_type) || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'period_month, period_year, run_type and a non-empty items array are required' });
    }

    await client.query('BEGIN');

    const fy = financialYear(`${period_year}-${String(period_month).padStart(2, '0')}-01`);
    const run_number = await generateDocNumber(
      client, 'payroll_runs', 'run_number', 'PR',
      `${period_year}-${String(period_month).padStart(2, '0')}-01`
    );

    let totalGross = 0, totalAdv = 0, totalNet = 0;
    const runRes = await client.query(
      `INSERT INTO payroll_runs (run_number, period_month, period_year, run_type, status, financial_year, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$7) RETURNING *`,
      [run_number, period_month, period_year, run_type, fy, notes || null, req.user.id]
    );
    const run = runRes.rows[0];

    for (const it of items) {
      const gross = parseFloat(it.gross_amount || 0);
      const adv = parseFloat(it.advance_deducted || 0);
      const net = parseFloat((gross - adv).toFixed(2));
      if (net < 0) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'Advance deduction cannot exceed gross for an employee' }); }
      totalGross += gross; totalAdv += adv; totalNet += net;

      await client.query(
        `INSERT INTO payroll_items (payroll_run_id, employee_id, gross_amount, days_worked, advance_deducted, net_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
        [run.id, it.employee_id, gross, it.days_worked ?? null, adv, net]
      );
    }

    await client.query(
      `UPDATE payroll_runs SET total_gross = $1, total_advance_deducted = $2, total_net = $3, updated_at = NOW() WHERE id = $4`,
      [totalGross.toFixed(2), totalAdv.toFixed(2), totalNet.toFixed(2), run.id]
    );

    await client.query('COMMIT');
    logger.info('Payroll run created', { runId: run.id, items: items.length });
    res.status(201).json({ success: true, data: { ...run, total_gross: totalGross, total_advance_deducted: totalAdv, total_net: totalNet } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const listRuns = async (req, res, next) => {
  try {
    const { status, run_type, page = 1, limit = 20 } = req.query;
    const params = [];
    const conditions = ['deleted_at IS NULL'];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (run_type) { params.push(run_type); conditions.push(`run_type = $${params.length}`); }
    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*) FROM payroll_runs WHERE ${whereClause}`, params);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit)); params.push(offset);

    const rows = await db.query(
      `SELECT *, (SELECT COUNT(*) FROM payroll_items pi WHERE pi.payroll_run_id = payroll_runs.id) AS item_count
       FROM payroll_runs WHERE ${whereClause}
       ORDER BY period_year DESC, period_month DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = parseInt(countRes.rows[0].count);
    res.json({
      success: true,
      data: rows.rows.map((r) => ({ ...r, period_label: monthLabel(r.period_month, r.period_year) })),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

const getRun = async (req, res, next) => {
  try {
    const { id } = req.params;
    const runRes = await db.query(`SELECT * FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (runRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Payroll run not found' });

    const items = await db.query(
      `SELECT pi.*, e.full_name, e.employee_code, e.employee_type,
              ba.account_name AS bank_account_name, ca.account_name AS cash_account_name
       FROM payroll_items pi
       JOIN employees e ON e.id = pi.employee_id
       LEFT JOIN bank_accounts ba ON ba.id = pi.bank_account_id
       LEFT JOIN cash_accounts ca ON ca.id = pi.cash_account_id
       WHERE pi.payroll_run_id = $1
       ORDER BY e.full_name`,
      [id]
    );
    const run = runRes.rows[0];
    res.json({ success: true, data: { ...run, period_label: monthLabel(run.period_month, run.period_year), items: items.rows } });
  } catch (err) {
    next(err);
  }
};

// Pay all pending items in a run from one source; post ledger debits + recover advances.
const payRun = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payment_source, bank_account_id, cash_account_id, paid_date } = req.body;
    if (!['cash', 'bank'].includes(payment_source)) return res.status(400).json({ success: false, message: 'payment_source must be cash or bank' });
    if (payment_source === 'bank' && !bank_account_id) return res.status(400).json({ success: false, message: 'bank_account_id required' });
    if (payment_source === 'cash' && !cash_account_id) return res.status(400).json({ success: false, message: 'cash_account_id required' });

    await client.query('BEGIN');

    const runRes = await client.query(`SELECT * FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
    if (runRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Payroll run not found' }); }
    const run = runRes.rows[0];
    if (run.status === 'paid') { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'Run already paid' }); }

    const entryDate = paid_date || new Date().toISOString().split('T')[0];
    const periodLabel = monthLabel(run.period_month, run.period_year);

    const items = await client.query(
      `SELECT pi.*, e.full_name FROM payroll_items pi
       JOIN employees e ON e.id = pi.employee_id
       WHERE pi.payroll_run_id = $1 AND pi.status = 'pending'`,
      [id]
    );

    let paidCount = 0;
    for (const item of items.rows) {
      // 1. Ledger debit for the net payout
      if (parseFloat(item.net_amount) > 0) {
        await postSourceDebit(client, {
          paymentSource: payment_source,
          bankAccountId: bank_account_id,
          cashAccountId: cash_account_id,
          entryDate,
          amount: parseFloat(item.net_amount),
          partyName: item.full_name,
          narration: `${run.run_type === 'salary' ? 'Salary' : 'Wages'} ${periodLabel} - ${item.full_name}`,
          referenceNumber: run.run_number,
          sourceType: 'payroll',
          sourceId: item.id,
          userId: req.user.id,
        });
      }

      // 2. Recover advances (FIFO) by advance_deducted
      let toRecover = parseFloat(item.advance_deducted || 0);
      if (toRecover > 0) {
        const advances = await client.query(
          `SELECT id, amount, amount_recovered FROM employee_advances
           WHERE employee_id = $1 AND status = 'outstanding' AND deleted_at IS NULL
           ORDER BY advance_date ASC, created_at ASC FOR UPDATE`,
          [item.employee_id]
        );
        for (const a of advances.rows) {
          if (toRecover <= 0) break;
          const balance = parseFloat(a.amount) - parseFloat(a.amount_recovered);
          const rec = Math.min(balance, toRecover);
          const newRecovered = parseFloat((parseFloat(a.amount_recovered) + rec).toFixed(2));
          const fullyRecovered = newRecovered >= parseFloat(a.amount);
          await client.query(
            `UPDATE employee_advances SET amount_recovered = $1, status = $2, updated_at = NOW() WHERE id = $3`,
            [newRecovered, fullyRecovered ? 'recovered' : 'outstanding', a.id]
          );
          toRecover = parseFloat((toRecover - rec).toFixed(2));
        }
      }

      // 3. Mark item paid
      await client.query(
        `UPDATE payroll_items SET status = 'paid', payment_source = $1, bank_account_id = $2, cash_account_id = $3, paid_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [
          payment_source,
          payment_source === 'bank' ? bank_account_id : null,
          payment_source === 'cash' ? cash_account_id : null,
          item.id,
        ]
      );
      paidCount++;
    }

    await client.query(`UPDATE payroll_runs SET status = 'paid', updated_by = $1, updated_at = NOW() WHERE id = $2`, [req.user.id, id]);

    await client.query('COMMIT');
    logger.info('Payroll run paid', { runId: id, paidCount, source: payment_source });
    res.json({ success: true, message: `Paid ${paidCount} employee(s) from ${payment_source}`, paid_count: paidCount });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const deleteRun = async (req, res, next) => {
  try {
    const { id } = req.params;
    const run = await db.query(`SELECT status FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (run.rows.length === 0) return res.status(404).json({ success: false, message: 'Payroll run not found' });
    if (run.rows[0].status === 'paid') return res.status(400).json({ success: false, message: 'A paid run cannot be deleted' });

    await db.query(`UPDATE payroll_runs SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`, [req.user.id, id]);
    res.json({ success: true, message: 'Payroll run deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { previewRun, createRun, listRuns, getRun, payRun, deleteRun };
