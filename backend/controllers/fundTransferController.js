/**
 * Fund Transfer Controller — Cash -> Bank deposits ("cash deposit / savings").
 *
 * A deposit moves money out of Cash-in-Hand into a Bank account. To keep both
 * sides reconciled it is recorded as a paired double entry in one transaction:
 *   - a DEBIT  on the cash ledger  (cash decreases)
 *   - a CREDIT on the bank ledger  (bank increases)
 * both linked to the fund_transfers row via source_type='cash_deposit'.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear, generateDocNumber } = require('../utils/financialYear');
const { computeBalance } = require('./cashLedgerController');

// ─── CREATE DEPOSIT ───────────────────────────────────────────────────────────
const createTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      transfer_date, from_cash_account_id, to_bank_account_id,
      amount, reference_number, notes,
    } = req.body;

    const amtNum = parseFloat(amount);
    if (!transfer_date || !from_cash_account_id || !to_bank_account_id || isNaN(amtNum) || amtNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'transfer_date, from_cash_account_id, to_bank_account_id and a positive amount are required',
      });
    }

    await client.query('BEGIN');

    const cashAcc = await client.query(
      `SELECT account_name FROM cash_accounts WHERE id = $1 AND is_active = true`, [from_cash_account_id]
    );
    if (cashAcc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cash account not found or inactive' });
    }
    const bankAcc = await client.query(
      `SELECT account_name FROM bank_accounts WHERE id = $1 AND is_active = true`, [to_bank_account_id]
    );
    if (bankAcc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Bank account not found or inactive' });
    }

    // Guard: cannot deposit more cash than is on hand.
    const cashBalance = await computeBalance(from_cash_account_id, null, client);
    if (amtNum > cashBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Insufficient cash-in-hand. Available ₹${cashBalance.toLocaleString('en-IN')}, requested ₹${amtNum.toLocaleString('en-IN')}.`,
      });
    }

    const fy = financialYear(transfer_date);
    const transferNumber = await generateDocNumber(client, 'fund_transfers', 'transfer_number', 'DEP', transfer_date);

    const insert = await client.query(
      `INSERT INTO fund_transfers
         (transfer_number, transfer_date, financial_year, from_cash_account_id, to_bank_account_id,
          amount, reference_number, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [transferNumber, transfer_date, fy, from_cash_account_id, to_bank_account_id,
        amtNum, reference_number || null, notes || null, req.user.id]
    );
    const transfer = insert.rows[0];

    // Cash leg: DEBIT (money leaves cash)
    await client.query(
      `INSERT INTO cash_ledger_entries
         (cash_account_id, entry_date, entry_type, amount, party_name, narration,
          reference_number, source_type, source_id, created_by)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, 'cash_deposit', $7, $8)`,
      [from_cash_account_id, transfer_date, amtNum, `Deposit to ${bankAcc.rows[0].account_name}`,
        notes || `Cash deposit ${transferNumber}`, reference_number || null, transfer.id, req.user.id]
    );

    // Bank leg: CREDIT (money enters bank)
    await client.query(
      `INSERT INTO bank_ledger_entries
         (bank_account_id, entry_date, entry_type, amount, party_name, narration,
          reference_number, source_type, source_id, created_by)
       VALUES ($1, $2, 'credit', $3, $4, $5, $6, 'cash_deposit', $7, $8)`,
      [to_bank_account_id, transfer_date, amtNum, `Cash deposit from ${cashAcc.rows[0].account_name}`,
        notes || `Cash deposit ${transferNumber}`, reference_number || null, transfer.id, req.user.id]
    );

    await client.query('COMMIT');
    logger.info('Cash deposit recorded', { transferId: transfer.id, amount: amtNum, userId: req.user.id });
    res.status(201).json({ success: true, data: transfer });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── LIST DEPOSITS ────────────────────────────────────────────────────────────
const listTransfers = async (req, res, next) => {
  try {
    const { from_date, to_date, page = 1, limit = 20 } = req.query;
    const params = [];
    const conditions = ['ft.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`ft.transfer_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`ft.transfer_date <= $${params.length}`); }

    const whereClause = conditions.join(' AND ');
    const countRes = await db.query(`SELECT COUNT(*) FROM fund_transfers ft WHERE ${whereClause}`, params);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await db.query(
      `SELECT ft.id, ft.transfer_number, ft.transfer_date, ft.financial_year, ft.amount,
              ft.reference_number, ft.notes,
              ca.account_name AS from_cash_account_name,
              ba.account_name AS to_bank_account_name,
              ft.created_at, u.full_name AS created_by_name
       FROM fund_transfers ft
       JOIN cash_accounts ca ON ca.id = ft.from_cash_account_id
       JOIN bank_accounts ba ON ba.id = ft.to_bank_account_id
       LEFT JOIN users u ON u.id = ft.created_by
       WHERE ${whereClause}
       ORDER BY ft.transfer_date DESC, ft.created_at DESC
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

// ─── DELETE DEPOSIT (soft) — reverses both legs ───────────────────────────────
const deleteTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM fund_transfers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    await client.query(
      `UPDATE fund_transfers SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );
    // Reverse both ledger legs (bank_ledger_entries has no deleted_by column)
    await client.query(
      `UPDATE cash_ledger_entries SET deleted_at = NOW(), deleted_by = $1, updated_by = $1
       WHERE source_type = 'cash_deposit' AND source_id = $2 AND deleted_at IS NULL`,
      [req.user.id, id]
    );
    await client.query(
      `UPDATE bank_ledger_entries SET deleted_at = NOW(), updated_by = $1
       WHERE source_type = 'cash_deposit' AND source_id = $2 AND deleted_at IS NULL`,
      [req.user.id, id]
    );

    await client.query('COMMIT');
    logger.info('Cash deposit deleted', { transferId: id, userId: req.user.id });
    res.json({ success: true, message: 'Deposit deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { createTransfer, listTransfers, deleteTransfer };
