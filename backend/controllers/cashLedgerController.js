/**
 * Cash Ledger Controller
 *
 * Tally-style "cash book" for Cash-in-Hand, mirroring the Bank Ledger.
 * Tracks an opening balance plus credit/debit entries; the running balance
 * is computed dynamically (never stored). Auto-posted debits arrive from the
 * expense, payroll, advance, and deposit flows (source_type != 'manual').
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear } = require('../utils/financialYear');

// ─── Helper: compute cash balance up to (and including) a given date ──────────
async function computeBalance(accountId, upToDate = null, runner = db) {
  let obSql = `
    SELECT entry_date, amount
    FROM cash_ledger_entries
    WHERE cash_account_id = $1
      AND entry_type = 'opening_balance'
      AND deleted_at IS NULL
  `;
  const obParams = [accountId];
  if (upToDate) {
    obParams.push(upToDate);
    obSql += ` AND entry_date <= $2`;
  }
  obSql += ` ORDER BY entry_date DESC LIMIT 1`;

  const obResult = await runner.query(obSql, obParams);
  if (obResult.rows.length === 0) return 0;

  const ob = obResult.rows[0];
  let balance = parseFloat(ob.amount);

  const txParams = [accountId, ob.entry_date];
  let txSql = `
    SELECT COALESCE(
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END),
      0
    ) AS net
    FROM cash_ledger_entries
    WHERE cash_account_id = $1
      AND entry_type IN ('credit', 'debit')
      AND entry_date >= $2
      AND deleted_at IS NULL
  `;
  if (upToDate) {
    txParams.push(upToDate);
    txSql += ` AND entry_date <= $3`;
  }

  const txResult = await runner.query(txSql, txParams);
  balance += parseFloat(txResult.rows[0].net);
  return parseFloat(balance.toFixed(2));
}

// ─── LIST ACCOUNTS — with current balance ─────────────────────────────────────
const listAccounts = async (req, res, next) => {
  try {
    const accounts = await db.query(
      `SELECT id, account_name, is_active, sort_order
       FROM cash_accounts
       WHERE is_active = true
       ORDER BY sort_order, created_at`
    );

    const withBalances = await Promise.all(
      accounts.rows.map(async (acc) => {
        const balance = await computeBalance(acc.id);
        return { ...acc, current_balance: balance };
      })
    );

    res.json({ success: true, data: withBalances });
  } catch (err) {
    next(err);
  }
};

// ─── UPSERT ACCOUNT ───────────────────────────────────────────────────────────
const upsertAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account_name, sort_order } = req.body;

    if (!account_name) {
      return res.status(400).json({ success: false, message: 'account_name is required' });
    }

    if (!id) {
      const result = await db.query(
        `INSERT INTO cash_accounts (account_name, sort_order)
         VALUES ($1, $2) RETURNING *`,
        [account_name, sort_order || 0]
      );
      logger.info('Cash account created', { accountId: result.rows[0].id });
      return res.status(201).json({ success: true, data: result.rows[0] });
    }

    const existing = await db.query(`SELECT id FROM cash_accounts WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cash account not found' });
    }

    const result = await db.query(
      `UPDATE cash_accounts
       SET account_name = $1, sort_order = COALESCE($2, sort_order), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [account_name, sort_order || null, id]
    );
    logger.info('Cash account updated', { accountId: id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── SET OPENING BALANCE ──────────────────────────────────────────────────────
const setOpeningBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { entry_date, amount } = req.body;

    if (!entry_date || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ success: false, message: 'entry_date and amount are required' });
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum < 0) {
      return res.status(400).json({ success: false, message: 'Opening balance must be 0 or greater' });
    }

    const accountCheck = await db.query(
      `SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cash account not found' });
    }

    const fy = financialYear(entry_date);
    const existing = await db.query(
      `SELECT id FROM cash_ledger_entries
       WHERE cash_account_id = $1 AND entry_type = 'opening_balance'
         AND financial_year = $2 AND deleted_at IS NULL`,
      [id, fy]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE cash_ledger_entries
         SET amount = $1, entry_date = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $4`,
        [amtNum, entry_date, req.user.id, existing.rows[0].id]
      );
      return res.json({ success: true, message: `Opening balance for FY ${fy} updated` });
    }

    await db.query(
      `INSERT INTO cash_ledger_entries
         (cash_account_id, entry_date, entry_type, amount, narration, party_name, source_type, created_by)
       VALUES ($1, $2, 'opening_balance', $3, $4, 'Opening Balance', 'manual', $5)`,
      [id, entry_date, amtNum, `Opening Balance FY ${fy}`, req.user.id]
    );
    res.status(201).json({ success: true, message: `Opening balance for FY ${fy} set` });
  } catch (err) {
    next(err);
  }
};

// ─── GET LEDGER ───────────────────────────────────────────────────────────────
const getLedger = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from_date, to_date, entry_type, page = 1, limit = 50 } = req.query;

    const accountCheck = await db.query(
      `SELECT id, account_name FROM cash_accounts WHERE id = $1`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cash account not found' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [id];
    const conditions = ['cle.cash_account_id = $1', 'cle.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`cle.entry_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`cle.entry_date <= $${params.length}`); }
    if (entry_type) { params.push(entry_type); conditions.push(`cle.entry_type = $${params.length}`); }

    const whereClause = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM cash_ledger_entries cle WHERE ${whereClause}`, params
    );

    // Running balance must account for rows on earlier pages, so walk the
    // whole filtered set (types + amounts only) and slice out this page.
    const allRows = await db.query(
      `SELECT cle.entry_type, cle.amount
       FROM cash_ledger_entries cle
       WHERE ${whereClause}
       ORDER BY cle.entry_date ASC, cle.created_at ASC, cle.id ASC`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    const entries = await db.query(
      `SELECT
         cle.id, cle.entry_date, cle.financial_year, cle.entry_type,
         cle.amount, cle.narration, cle.party_name, cle.reference_number,
         cle.source_type, cle.source_id, cle.created_at, cle.updated_at,
         u.full_name AS created_by_name
       FROM cash_ledger_entries cle
       LEFT JOIN users u ON u.id = cle.created_by
       WHERE ${whereClause}
       ORDER BY cle.entry_date ASC, cle.created_at ASC, cle.id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const openingBalance = from_date
      ? await computeBalance(id, new Date(new Date(from_date) - 86400000).toISOString().split('T')[0])
      : 0;

    let runningBalance = openingBalance;
    const balances = allRows.rows.map((row) => {
      if (row.entry_type === 'opening_balance') {
        runningBalance = parseFloat(row.amount);
      } else if (row.entry_type === 'credit') {
        runningBalance += parseFloat(row.amount);
      } else {
        runningBalance -= parseFloat(row.amount);
      }
      return parseFloat(runningBalance.toFixed(2));
    });

    const rowsWithBalance = entries.rows.map((row, i) => ({
      ...row,
      running_balance: balances[offset + i],
    }));

    const total = parseInt(countResult.rows[0].count);
    res.json({
      success: true,
      account: accountCheck.rows[0],
      opening_balance: openingBalance,
      data: rowsWithBalance,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── ADD MANUAL ENTRY ─────────────────────────────────────────────────────────
const addManualEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { entry_date, entry_type, amount, party_name, narration, reference_number } = req.body;

    if (!entry_date || !entry_type || !amount || !party_name) {
      return res.status(400).json({
        success: false,
        message: 'entry_date, entry_type, amount, and party_name are required',
      });
    }
    if (!['credit', 'debit'].includes(entry_type)) {
      return res.status(400).json({ success: false, message: 'entry_type must be "credit" or "debit"' });
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const accountCheck = await db.query(
      `SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cash account not found' });
    }

    const result = await db.query(
      `INSERT INTO cash_ledger_entries
         (cash_account_id, entry_date, entry_type, amount, party_name, narration, reference_number, source_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8)
       RETURNING *`,
      [id, entry_date, entry_type, amtNum, party_name, narration || null, reference_number || null, req.user.id]
    );
    logger.info('Manual cash ledger entry added', { accountId: id, entryId: result.rows[0].id, userId: req.user.id });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── EDIT MANUAL ENTRY ────────────────────────────────────────────────────────
const editManualEntry = async (req, res, next) => {
  try {
    const { id, entryId } = req.params;
    const { entry_date, entry_type, amount, party_name, narration, reference_number } = req.body;

    const existing = await db.query(
      `SELECT id, source_type FROM cash_ledger_entries
       WHERE id = $1 AND cash_account_id = $2 AND deleted_at IS NULL`,
      [entryId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }
    if (existing.rows[0].source_type !== 'manual') {
      return res.status(403).json({
        success: false,
        message: 'Auto-posted entries cannot be edited. Edit the source expense / payout instead.',
      });
    }
    if (entry_type && !['credit', 'debit'].includes(entry_type)) {
      return res.status(400).json({ success: false, message: 'entry_type must be "credit" or "debit"' });
    }
    if (amount !== undefined) {
      const amtNum = parseFloat(amount);
      if (isNaN(amtNum) || amtNum <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      }
    }

    const result = await db.query(
      `UPDATE cash_ledger_entries
       SET entry_date = COALESCE($1, entry_date),
           entry_type = COALESCE($2, entry_type),
           amount = COALESCE($3, amount),
           party_name = COALESCE($4, party_name),
           narration = COALESCE($5, narration),
           reference_number = COALESCE($6, reference_number),
           updated_by = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        entry_date || null,
        entry_type || null,
        amount !== undefined ? parseFloat(amount) : null,
        party_name || null,
        narration !== undefined ? narration : null,
        reference_number !== undefined ? reference_number : null,
        req.user.id,
        entryId,
      ]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE MANUAL ENTRY (soft delete) ────────────────────────────────────────
const deleteManualEntry = async (req, res, next) => {
  try {
    const { id, entryId } = req.params;
    const existing = await db.query(
      `SELECT id, source_type FROM cash_ledger_entries
       WHERE id = $1 AND cash_account_id = $2 AND deleted_at IS NULL`,
      [entryId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }
    if (existing.rows[0].source_type !== 'manual') {
      return res.status(403).json({
        success: false,
        message: 'Auto-posted entries cannot be deleted here. Delete the source expense / payout instead.',
      });
    }
    await db.query(
      `UPDATE cash_ledger_entries SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`,
      [req.user.id, entryId]
    );
    res.json({ success: true, message: 'Entry deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── MONTHLY SUMMARY ──────────────────────────────────────────────────────────
const getMonthlySummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { financial_year } = req.query;
    if (!financial_year) {
      return res.status(400).json({ success: false, message: 'financial_year is required (e.g. 2025-26)' });
    }

    const accountCheck = await db.query(
      `SELECT id, account_name FROM cash_accounts WHERE id = $1`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cash account not found' });
    }

    const [startYearStr] = financial_year.split('-');
    const startYear = parseInt(startYearStr);

    const obResult = await db.query(
      `SELECT amount FROM cash_ledger_entries
       WHERE cash_account_id = $1 AND financial_year = $2
         AND entry_type = 'opening_balance' AND deleted_at IS NULL
       ORDER BY entry_date ASC LIMIT 1`,
      [id, financial_year]
    );

    let fyOpeningBalance;
    if (obResult.rows.length > 0) {
      fyOpeningBalance = parseFloat(obResult.rows[0].amount);
    } else {
      fyOpeningBalance = await computeBalance(id, `${startYear}-03-31`);
    }

    const monthlyData = await db.query(
      `SELECT
         TO_CHAR(entry_date, 'YYYY-MM') AS month_key,
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) AS total_credits,
         COALESCE(SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END), 0) AS total_debits
       FROM cash_ledger_entries
       WHERE cash_account_id = $1 AND financial_year = $2
         AND entry_type IN ('credit', 'debit') AND deleted_at IS NULL
       GROUP BY month_key ORDER BY month_key`,
      [id, financial_year]
    );

    const monthMap = {};
    for (const row of monthlyData.rows) monthMap[row.month_key] = row;

    let runningBalance = fyOpeningBalance;
    const months = [];
    for (let i = 0; i < 12; i++) {
      const mo = ((3 + i) % 12) + 1;
      const yr = mo >= 4 ? startYear : startYear + 1;
      const key = `${yr}-${String(mo).padStart(2, '0')}`;
      const label = new Date(`${yr}-${String(mo).padStart(2, '0')}-01`)
        .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      const data = monthMap[key] || { total_credits: '0', total_debits: '0' };
      const credits = parseFloat(data.total_credits);
      const debits = parseFloat(data.total_debits);
      const opening = runningBalance;
      runningBalance = parseFloat((runningBalance + credits - debits).toFixed(2));

      months.push({
        month_key: key,
        month_label: label,
        opening_balance: parseFloat(opening.toFixed(2)),
        total_credits: parseFloat(credits.toFixed(2)),
        total_debits: parseFloat(debits.toFixed(2)),
        closing_balance: runningBalance,
      });
    }

    res.json({
      success: true,
      account: accountCheck.rows[0],
      financial_year,
      fy_opening_balance: fyOpeningBalance,
      data: months,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  computeBalance,
  listAccounts,
  upsertAccount,
  setOpeningBalance,
  getLedger,
  addManualEntry,
  editManualEntry,
  deleteManualEntry,
  getMonthlySummary,
};
