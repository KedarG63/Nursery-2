/**
 * Advance Controller — salary/wage advances given to staff.
 *
 * Paying an advance moves money out (cash/bank DEBIT, source_type='advance').
 * Outstanding advances are recovered by deduction during a payroll run.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear, generateDocNumber } = require('../utils/financialYear');
const { postSourceDebit, reverseSourceEntries } = require('./expenseController');

const createAdvance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { employee_id, advance_date, amount, payment_source, bank_account_id, cash_account_id, notes } = req.body;
    const amt = Number(amount);
    if (!employee_id || !advance_date || isNaN(amt) || amt <= 0 || !['cash', 'bank'].includes(payment_source)) {
      return res.status(400).json({ success: false, message: 'employee_id, advance_date, positive amount and payment_source are required' });
    }
    if (payment_source === 'bank' && !bank_account_id) return res.status(400).json({ success: false, message: 'bank_account_id required for bank source' });
    if (payment_source === 'cash' && !cash_account_id) return res.status(400).json({ success: false, message: 'cash_account_id required for cash source' });

    await client.query('BEGIN');

    const emp = await client.query(`SELECT full_name FROM employees WHERE id = $1 AND deleted_at IS NULL`, [employee_id]);
    if (emp.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Employee not found' }); }

    const fy = financialYear(advance_date);
    const advanceNumber = await generateDocNumber(client, 'employee_advances', 'advance_number', 'ADV', advance_date);

    const insert = await client.query(
      `INSERT INTO employee_advances
         (advance_number, employee_id, advance_date, financial_year, amount, payment_source,
          bank_account_id, cash_account_id, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
      [
        advanceNumber, employee_id, advance_date, fy, amt, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        notes || null, req.user.id,
      ]
    );
    const advance = insert.rows[0];

    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: bank_account_id,
      cashAccountId: cash_account_id,
      entryDate: advance_date,
      amount: amt,
      partyName: emp.rows[0].full_name,
      narration: `Advance to ${emp.rows[0].full_name} (${advanceNumber})`,
      referenceNumber: null,
      sourceType: 'advance',
      sourceId: advance.id,
      userId: req.user.id,
    });

    await client.query('COMMIT');
    logger.info('Advance recorded', { advanceId: advance.id, amount: amt, userId: req.user.id });
    res.status(201).json({ success: true, data: advance });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const listAdvances = async (req, res, next) => {
  try {
    const { employee_id, status, page = 1, limit = 20 } = req.query;
    const params = [];
    const conditions = ['a.deleted_at IS NULL'];
    if (employee_id) { params.push(employee_id); conditions.push(`a.employee_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*) FROM employee_advances a WHERE ${whereClause}`, params);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await db.query(
      `SELECT a.*, (a.amount - a.amount_recovered) AS balance,
              e.full_name, e.employee_code,
              ba.account_name AS bank_account_name, ca.account_name AS cash_account_name
       FROM employee_advances a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN bank_accounts ba ON ba.id = a.bank_account_id
       LEFT JOIN cash_accounts ca ON ca.id = a.cash_account_id
       WHERE ${whereClause}
       ORDER BY a.advance_date DESC, a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = parseInt(countRes.rows[0].count);
    res.json({
      success: true,
      data: rows.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

const deleteAdvance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT amount_recovered FROM employee_advances WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Advance not found' }); }
    if (parseFloat(existing.rows[0].amount_recovered) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot delete an advance that has already been partly recovered' });
    }

    await client.query(`UPDATE employee_advances SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`, [req.user.id, id]);
    await reverseSourceEntries(client, 'advance', id, req.user.id);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Advance deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { createAdvance, listAdvances, deleteAdvance };
