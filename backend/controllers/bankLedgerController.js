/**
 * Bank Ledger Controller
 *
 * Tally-style ledger for up to 3 business bank accounts.
 * Tracks opening balance, manual entries, and auto-synced transactions
 * from customer payments (credits) and vendor payments (debits).
 *
 * Balance model:
 *   The opening_balance entry for a financial year represents the ABSOLUTE
 *   bank statement balance on that date — it is NOT an additive transaction.
 *   We find the most recent opening_balance entry on or before a given date,
 *   use it as the base, then add credits and subtract debits from that point.
 *   This correctly handles multi-year use.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');

// ─── Helper: compute balance up to (and including) a given date ───────────────
// Finds the most recent opening_balance entry ≤ upToDate, then sums
// all credit/debit entries from that opening_balance date up to upToDate.
// If no opening_balance entry exists, returns 0 (balance unknown).
async function computeBalance(accountId, upToDate = null, runner = db) {
  // 1. Find latest opening balance on or before upToDate
  let obSql = `
    SELECT entry_date, amount
    FROM bank_ledger_entries
    WHERE bank_account_id = $1
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

  if (obResult.rows.length === 0) {
    // No opening balance set yet — return 0
    return 0;
  }

  const ob = obResult.rows[0];
  let balance = parseFloat(ob.amount);

  // 2. Sum all credit/debit entries from ob.entry_date to upToDate
  const txParams = [accountId, ob.entry_date];
  const txSql = `
    SELECT COALESCE(
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END),
      0
    ) AS net
    FROM bank_ledger_entries
    WHERE bank_account_id = $1
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

// ─── Helper: compute financial year string from a date string ─────────────────
function financialYear(dateStr) {
  const d = new Date(dateStr);
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1; // 1-indexed
  if (mo >= 4) {
    return `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
  }
  return `${yr - 1}-${String(yr % 100).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST ACCOUNTS — with current balance
// GET /api/bank-accounts
// ─────────────────────────────────────────────────────────────────────────────
const listAccounts = async (req, res, next) => {
  try {
    const accounts = await db.query(
      `SELECT id, account_name, bank_name, account_number, ifsc_code, branch, is_active, sort_order
       FROM bank_accounts
       WHERE is_active = true
       ORDER BY sort_order, created_at`
    );

    // Attach current balance to each account
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

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT ACCOUNT (create or update)
// POST /api/bank-accounts          — create
// PUT  /api/bank-accounts/:id      — update
// ─────────────────────────────────────────────────────────────────────────────
const upsertAccount = async (req, res, next) => {
  try {
    const { id } = req.params; // undefined on POST
    const { account_name, bank_name, account_number, ifsc_code, branch, sort_order } = req.body;

    if (!account_name || !bank_name || !account_number) {
      return res.status(400).json({
        success: false,
        message: 'account_name, bank_name, and account_number are required',
      });
    }

    if (!id) {
      // CREATE — enforce 3-account limit
      const countRes = await db.query(
        `SELECT COUNT(*) FROM bank_accounts WHERE is_active = true`
      );
      if (parseInt(countRes.rows[0].count) >= 3) {
        return res.status(409).json({
          success: false,
          message: 'Maximum of 3 active bank accounts allowed',
        });
      }

      const result = await db.query(
        `INSERT INTO bank_accounts (account_name, bank_name, account_number, ifsc_code, branch, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [account_name, bank_name, account_number, ifsc_code || null, branch || null, sort_order || 0]
      );

      logger.info('Bank account created', { accountId: result.rows[0].id });
      return res.status(201).json({ success: true, data: result.rows[0] });
    }

    // UPDATE
    const existing = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1`, [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const result = await db.query(
      `UPDATE bank_accounts
       SET account_name = $1, bank_name = $2, account_number = $3,
           ifsc_code = $4, branch = $5, sort_order = COALESCE($6, sort_order),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [account_name, bank_name, account_number, ifsc_code || null, branch || null, sort_order || null, id]
    );

    logger.info('Bank account updated', { accountId: id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SET OPENING BALANCE
// POST /api/bank-accounts/:id/opening-balance
// Body: { entry_date, amount }
// ─────────────────────────────────────────────────────────────────────────────
const setOpeningBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { entry_date, amount } = req.body;

    if (!entry_date || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ success: false, message: 'entry_date and amount are required' });
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum < 0) {
      return res.status(400).json({ success: false, message: 'Opening balance amount must be 0 or greater' });
    }

    const accountCheck = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const fy = financialYear(entry_date);

    // If an opening balance already exists for this account + FY, update it
    const existing = await db.query(
      `SELECT id FROM bank_ledger_entries
       WHERE bank_account_id = $1
         AND entry_type = 'opening_balance'
         AND financial_year = $2
         AND deleted_at IS NULL`,
      [id, fy]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE bank_ledger_entries
         SET amount = $1, entry_date = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $4`,
        [amtNum, entry_date, req.user.id, existing.rows[0].id]
      );
      logger.info('Opening balance updated', { accountId: id, fy, amount: amtNum });
      return res.json({ success: true, message: `Opening balance for FY ${fy} updated to ₹${amtNum.toLocaleString('en-IN')}` });
    }

    await db.query(
      `INSERT INTO bank_ledger_entries
         (bank_account_id, entry_date, entry_type, amount, narration, party_name, source_type, created_by)
       VALUES ($1, $2, 'opening_balance', $3, $4, 'Opening Balance', 'manual', $5)`,
      [id, entry_date, amtNum, `Opening Balance FY ${fy}`, req.user.id]
    );

    logger.info('Opening balance set', { accountId: id, fy, amount: amtNum });
    res.status(201).json({ success: true, message: `Opening balance for FY ${fy} set to ₹${amtNum.toLocaleString('en-IN')}` });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET LEDGER
// GET /api/bank-accounts/:id/ledger
// Query: from_date, to_date, entry_type, page, limit
// ─────────────────────────────────────────────────────────────────────────────
const getLedger = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      from_date,
      to_date,
      entry_type,
      page = 1,
      limit = 50,
    } = req.query;

    const accountCheck = await db.query(
      `SELECT id, account_name, bank_name, account_number FROM bank_accounts WHERE id = $1`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [id];
    const conditions = ['ble.bank_account_id = $1', 'ble.deleted_at IS NULL'];

    if (from_date) {
      params.push(from_date);
      conditions.push(`ble.entry_date >= $${params.length}`);
    }
    if (to_date) {
      params.push(to_date);
      conditions.push(`ble.entry_date <= $${params.length}`);
    }
    if (entry_type) {
      params.push(entry_type);
      conditions.push(`ble.entry_type = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM bank_ledger_entries ble WHERE ${whereClause}`,
      params
    );

    params.push(parseInt(limit));
    params.push(offset);

    // Fetch entries with recorder name
    const entries = await db.query(
      `SELECT
         ble.id, ble.entry_date, ble.financial_year, ble.entry_type,
         ble.amount, ble.narration, ble.party_name, ble.reference_number,
         ble.source_type, ble.source_id, ble.created_at, ble.updated_at,
         u.full_name AS created_by_name
       FROM bank_ledger_entries ble
       LEFT JOIN users u ON u.id = ble.created_by
       WHERE ${whereClause}
       ORDER BY ble.entry_date ASC, ble.created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Opening balance before range (for running balance column).
    // Use computeBalance so it correctly respects the most recent opening_balance entry.
    const openingBalance = from_date
      ? await computeBalance(id, new Date(new Date(from_date) - 86400000).toISOString().split('T')[0])
      : 0;

    // Attach running balance to each row
    let runningBalance = openingBalance;
    const rowsWithBalance = entries.rows.map((row) => {
      if (row.entry_type === 'opening_balance') {
        // Opening balance RESETS the running balance rather than adding
        runningBalance = parseFloat(row.amount);
      } else if (row.entry_type === 'credit') {
        runningBalance += parseFloat(row.amount);
      } else {
        runningBalance -= parseFloat(row.amount);
      }
      return { ...row, running_balance: parseFloat(runningBalance.toFixed(2)) };
    });

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

// ─────────────────────────────────────────────────────────────────────────────
// ADD MANUAL ENTRY
// POST /api/bank-accounts/:id/entries
// Body: { entry_date, entry_type, amount, party_name, narration, reference_number }
// ─────────────────────────────────────────────────────────────────────────────
const addManualEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { entry_date, entry_type, amount, party_name, narration, reference_number } = req.body;

    // Validation
    if (!entry_date || !entry_type || !amount || !party_name) {
      return res.status(400).json({
        success: false,
        message: 'entry_date, entry_type, amount, and party_name are required',
      });
    }
    if (!['credit', 'debit'].includes(entry_type)) {
      return res.status(400).json({
        success: false,
        message: 'entry_type must be "credit" or "debit"',
      });
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const accountCheck = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const result = await db.query(
      `INSERT INTO bank_ledger_entries
         (bank_account_id, entry_date, entry_type, amount, party_name, narration, reference_number, source_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8)
       RETURNING *`,
      [id, entry_date, entry_type, amtNum, party_name, narration || null, reference_number || null, req.user.id]
    );

    logger.info('Manual ledger entry added', { accountId: id, entryId: result.rows[0].id, userId: req.user.id });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MANUAL ENTRY
// PUT /api/bank-accounts/:id/entries/:entryId
// ─────────────────────────────────────────────────────────────────────────────
const editManualEntry = async (req, res, next) => {
  try {
    const { id, entryId } = req.params;
    const { entry_date, entry_type, amount, party_name, narration, reference_number } = req.body;

    const existing = await db.query(
      `SELECT id, source_type FROM bank_ledger_entries
       WHERE id = $1 AND bank_account_id = $2 AND deleted_at IS NULL`,
      [entryId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }
    if (existing.rows[0].source_type !== 'manual') {
      return res.status(403).json({
        success: false,
        message: 'Auto-synced entries cannot be edited. Edit the source payment or vendor bill instead.',
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
      `UPDATE bank_ledger_entries
       SET
         entry_date       = COALESCE($1, entry_date),
         entry_type       = COALESCE($2, entry_type),
         amount           = COALESCE($3, amount),
         party_name       = COALESCE($4, party_name),
         narration        = COALESCE($5, narration),
         reference_number = COALESCE($6, reference_number),
         updated_by       = $7,
         updated_at       = NOW()
       WHERE id = $8
       RETURNING *`,
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

    logger.info('Manual ledger entry updated', { entryId, userId: req.user.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE MANUAL ENTRY (soft delete)
// DELETE /api/bank-accounts/:id/entries/:entryId
// ─────────────────────────────────────────────────────────────────────────────
const deleteManualEntry = async (req, res, next) => {
  try {
    const { id, entryId } = req.params;

    const existing = await db.query(
      `SELECT id, source_type FROM bank_ledger_entries
       WHERE id = $1 AND bank_account_id = $2 AND deleted_at IS NULL`,
      [entryId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ledger entry not found' });
    }
    if (existing.rows[0].source_type !== 'manual') {
      return res.status(403).json({
        success: false,
        message: 'Auto-synced entries cannot be deleted here. Void the source payment instead.',
      });
    }

    await db.query(
      `UPDATE bank_ledger_entries SET deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [req.user.id, entryId]
    );

    logger.info('Manual ledger entry deleted', { entryId, userId: req.user.id });
    res.json({ success: true, message: 'Entry deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY SUMMARY
// GET /api/bank-accounts/:id/summary?financial_year=2025-26
// ─────────────────────────────────────────────────────────────────────────────
const getMonthlySummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { financial_year } = req.query;

    if (!financial_year) {
      return res.status(400).json({ success: false, message: 'financial_year is required (e.g. 2025-26)' });
    }

    const accountCheck = await db.query(
      `SELECT id, account_name FROM bank_accounts WHERE id = $1`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const [startYearStr] = financial_year.split('-');
    const startYear = parseInt(startYearStr);
    const fyStartDate = `${startYear}-04-01`;

    // Get the opening balance entry for this specific FY (the absolute starting balance)
    const obResult = await db.query(
      `SELECT amount FROM bank_ledger_entries
       WHERE bank_account_id = $1
         AND financial_year = $2
         AND entry_type = 'opening_balance'
         AND deleted_at IS NULL
       ORDER BY entry_date ASC
       LIMIT 1`,
      [id, financial_year]
    );

    // Starting balance for this FY:
    // If an opening_balance entry exists, use it directly (it's an absolute value).
    // Otherwise, fall back to the computed balance at end of prior FY.
    let fyOpeningBalance;
    if (obResult.rows.length > 0) {
      fyOpeningBalance = parseFloat(obResult.rows[0].amount);
    } else {
      // Compute balance as of March 31 of the FY start year (prior year closing)
      const priorYearEnd = `${startYear}-03-31`;
      fyOpeningBalance = await computeBalance(id, priorYearEnd);
    }

    // Monthly credits and debits — EXCLUDE opening_balance entries (they are handled separately)
    const monthlyData = await db.query(
      `SELECT
         TO_CHAR(entry_date, 'YYYY-MM') AS month_key,
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) AS total_credits,
         COALESCE(SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END), 0) AS total_debits
       FROM bank_ledger_entries
       WHERE bank_account_id = $1
         AND financial_year = $2
         AND entry_type IN ('credit', 'debit')
         AND deleted_at IS NULL
       GROUP BY month_key
       ORDER BY month_key`,
      [id, financial_year]
    );

    // Build April-to-March sequence and attach running balance
    const monthMap = {};
    for (const row of monthlyData.rows) {
      monthMap[row.month_key] = row;
    }

    let runningBalance = fyOpeningBalance;
    const months = [];

    for (let i = 0; i < 12; i++) {
      const mo = ((3 + i) % 12) + 1; // April=4 … March=3
      const yr = mo >= 4 ? startYear : startYear + 1;
      const key = `${yr}-${String(mo).padStart(2, '0')}`;
      const label = new Date(`${yr}-${String(mo).padStart(2, '0')}-01`)
        .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      const data = monthMap[key] || { total_credits: '0', total_debits: '0' };
      const credits = parseFloat(data.total_credits);
      const debits  = parseFloat(data.total_debits);
      const opening = runningBalance;
      runningBalance = parseFloat((runningBalance + credits - debits).toFixed(2));

      months.push({
        month_key: key,
        month_label: label,
        opening_balance: parseFloat(opening.toFixed(2)),
        total_credits:   parseFloat(credits.toFixed(2)),
        total_debits:    parseFloat(debits.toFixed(2)),
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

// ─────────────────────────────────────────────────────────────────────────────
// SYNC FROM EXISTING PAYMENT TABLES
// POST /api/bank-accounts/:id/sync
// Body: { sync_credits (bool), sync_debits (bool) }
// ─────────────────────────────────────────────────────────────────────────────
const syncFromPayments = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { sync_credits = true, sync_debits = true } = req.body;

    const accountCheck = await db.query(
      `SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [id]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    await client.query('BEGIN');

    let syncedCredits = 0;
    let syncedDebits = 0;

    // ── Credits: customer payments via bank/UPI/cheque ────────────────────────
    if (sync_credits) {
      const payments = await client.query(
        `SELECT
           p.id, p.payment_date, p.amount, p.transaction_id,
           c.name AS customer_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         WHERE p.payment_method IN ('bank_transfer', 'upi', 'cheque')
           AND p.status = 'success'
           AND p.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM bank_ledger_entries
             WHERE source_type = 'customer_payment'
               AND source_id = p.id
               AND deleted_at IS NULL
           )
         ORDER BY p.payment_date ASC`
      );

      for (const pmt of payments.rows) {
        await client.query(
          `INSERT INTO bank_ledger_entries
             (bank_account_id, entry_date, entry_type, amount, party_name, narration,
              reference_number, source_type, source_id, created_by)
           VALUES ($1, $2, 'credit', $3, $4, 'Customer payment', $5, 'customer_payment', $6, $7)`,
          [
            id,
            pmt.payment_date,
            parseFloat(pmt.amount),
            pmt.customer_name,
            pmt.transaction_id || null,
            pmt.id,
            req.user.id,
          ]
        );
        syncedCredits++;
      }
    }

    // ── Debits: vendor payments via bank/cheque ────────────────────────────────
    if (sync_debits) {
      const vendorPayments = await client.query(
        `SELECT
           spp.id, spp.payment_date, spp.amount, spp.transaction_reference,
           v.vendor_name
         FROM seed_purchase_payments spp
         JOIN seed_purchases sp ON sp.id = spp.seed_purchase_id
         JOIN vendors v ON v.id = sp.vendor_id
         WHERE spp.payment_method IN ('bank_transfer', 'cheque')
           AND NOT EXISTS (
             SELECT 1 FROM bank_ledger_entries
             WHERE source_type = 'vendor_payment'
               AND source_id = spp.id
               AND deleted_at IS NULL
           )
         ORDER BY spp.payment_date ASC`
      );

      for (const pmt of vendorPayments.rows) {
        await client.query(
          `INSERT INTO bank_ledger_entries
             (bank_account_id, entry_date, entry_type, amount, party_name, narration,
              reference_number, source_type, source_id, created_by)
           VALUES ($1, $2, 'debit', $3, $4, 'Vendor payment', $5, 'vendor_payment', $6, $7)`,
          [
            id,
            pmt.payment_date,
            parseFloat(pmt.amount),
            pmt.vendor_name,
            pmt.transaction_reference || null,
            pmt.id,
            req.user.id,
          ]
        );
        syncedDebits++;
      }
    }

    await client.query('COMMIT');

    logger.info('Bank ledger sync completed', {
      accountId: id,
      syncedCredits,
      syncedDebits,
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: `Sync complete. ${syncedCredits} customer receipt${syncedCredits !== 1 ? 's' : ''} and ${syncedDebits} vendor payment${syncedDebits !== 1 ? 's' : ''} added.`,
      synced_credits: syncedCredits,
      synced_debits: syncedDebits,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  listAccounts,
  upsertAccount,
  setOpeningBalance,
  getLedger,
  addManualEntry,
  editManualEntry,
  deleteManualEntry,
  getMonthlySummary,
  syncFromPayments,
};
