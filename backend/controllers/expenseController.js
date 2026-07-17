/**
 * Expense Controller
 *
 * Records daily business expenses (transport, cocopeat, tray, pesticide, etc.).
 * Error-free design: every expense selects exactly ONE payment source
 * (Cash-in-Hand or a specific Bank account) and, in the SAME transaction,
 * posts a matching DEBIT to that source's ledger so balances self-reconcile.
 *
 * Edits/deletes reverse the previously-posted ledger entry inside a
 * transaction, so cash & bank never drift from the expense records.
 */

const pool = require('../config/database');
const db = require('../utils/db');
const logger = require('../config/logger');
const { financialYear, generateDocNumber } = require('../utils/financialYear');

// Post a DEBIT (money out) to the chosen ledger for an expense/payout.
// Returns nothing; throws on error to roll back the caller's transaction.
async function postSourceDebit(client, {
  paymentSource, bankAccountId, cashAccountId,
  entryDate, amount, partyName, narration, referenceNumber,
  sourceType, sourceId, userId,
}) {
  if (paymentSource === 'bank') {
    await client.query(
      `INSERT INTO bank_ledger_entries
         (bank_account_id, entry_date, entry_type, amount, party_name, narration,
          reference_number, source_type, source_id, created_by)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8, $9)`,
      [bankAccountId, entryDate, amount, partyName, narration, referenceNumber || null, sourceType, sourceId, userId]
    );
  } else {
    await client.query(
      `INSERT INTO cash_ledger_entries
         (cash_account_id, entry_date, entry_type, amount, party_name, narration,
          reference_number, source_type, source_id, created_by)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8, $9)`,
      [cashAccountId, entryDate, amount, partyName, narration, referenceNumber || null, sourceType, sourceId, userId]
    );
  }
}

// Soft-delete any live ledger entries (bank + cash) for a given source record.
async function reverseSourceEntries(client, sourceType, sourceId, userId) {
  // Note: bank_ledger_entries has no deleted_by column (only updated_by);
  // cash_ledger_entries does. Keep the two UPDATEs in sync with each schema.
  await client.query(
    `UPDATE bank_ledger_entries SET deleted_at = NOW(), updated_by = $1
     WHERE source_type = $2 AND source_id = $3 AND deleted_at IS NULL`,
    [userId, sourceType, sourceId]
  );
  await client.query(
    `UPDATE cash_ledger_entries SET deleted_at = NOW(), deleted_by = $1, updated_by = $1
     WHERE source_type = $2 AND source_id = $3 AND deleted_at IS NULL`,
    [userId, sourceType, sourceId]
  );
}

// ─── CREATE EXPENSE ───────────────────────────────────────────────────────────
const createExpense = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      expense_date, category_id, vendor_id,
      amount, tax_amount = 0, description,
      payment_source, bank_account_id, cash_account_id,
      reference_number, attachment_url,
    } = req.body;

    await client.query('BEGIN');

    // Resolve category (and validate) + vendor name for the ledger party
    const catRes = await client.query(
      `SELECT name FROM expense_categories WHERE id = $1 AND is_active = true`, [category_id]
    );
    if (catRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid or inactive expense category' });
    }
    const categoryName = catRes.rows[0].name;

    let partyName = categoryName;
    if (vendor_id) {
      const vRes = await client.query(
        `SELECT vendor_name FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [vendor_id]
      );
      if (vRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Vendor not found' });
      }
      partyName = vRes.rows[0].vendor_name;
    }

    // Validate the chosen payment source account exists/active
    if (payment_source === 'bank') {
      const b = await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [bank_account_id]);
      if (b.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Bank account not found or inactive' });
      }
    } else {
      const c = await client.query(`SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [cash_account_id]);
      if (c.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cash account not found or inactive' });
      }
    }

    const fy = financialYear(expense_date);
    const expenseNumber = await generateDocNumber(client, 'expenses', 'expense_number', 'EXP', expense_date);
    const total = parseFloat((parseFloat(amount) + parseFloat(tax_amount || 0)).toFixed(2));

    const insert = await client.query(
      `INSERT INTO expenses
         (expense_number, expense_date, financial_year, category_id, vendor_id,
          amount, tax_amount, description, payment_source, bank_account_id, cash_account_id,
          attachment_url, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING *`,
      [
        expenseNumber, expense_date, fy, category_id, vendor_id || null,
        amount, tax_amount || 0, description || null, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        attachment_url || null, req.user.id,
      ]
    );
    const expense = insert.rows[0];

    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: bank_account_id,
      cashAccountId: cash_account_id,
      entryDate: expense_date,
      amount: total,
      partyName,
      narration: description || `Expense: ${categoryName} (${expenseNumber})`,
      referenceNumber: reference_number,
      sourceType: 'expense',
      sourceId: expense.id,
      userId: req.user.id,
    });

    await client.query('COMMIT');
    logger.info('Expense recorded', { expenseId: expense.id, total, source: payment_source, userId: req.user.id });
    res.status(201).json({ success: true, data: { ...expense, total_amount: total } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── UPDATE EXPENSE ───────────────────────────────────────────────────────────
const updateExpense = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      expense_date, category_id, vendor_id,
      amount, tax_amount = 0, description,
      payment_source, bank_account_id, cash_account_id,
      reference_number, attachment_url,
    } = req.body;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const catRes = await client.query(
      `SELECT name FROM expense_categories WHERE id = $1 AND is_active = true`, [category_id]
    );
    if (catRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid or inactive expense category' });
    }
    const categoryName = catRes.rows[0].name;

    let partyName = categoryName;
    if (vendor_id) {
      const vRes = await client.query(
        `SELECT vendor_name FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [vendor_id]
      );
      if (vRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Vendor not found' });
      }
      partyName = vRes.rows[0].vendor_name;
    }

    if (payment_source === 'bank') {
      const b = await client.query(`SELECT id FROM bank_accounts WHERE id = $1 AND is_active = true`, [bank_account_id]);
      if (b.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Bank account not found or inactive' });
      }
    } else {
      const c = await client.query(`SELECT id FROM cash_accounts WHERE id = $1 AND is_active = true`, [cash_account_id]);
      if (c.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cash account not found or inactive' });
      }
    }

    const fy = financialYear(expense_date);
    const total = parseFloat((parseFloat(amount) + parseFloat(tax_amount || 0)).toFixed(2));

    const upd = await client.query(
      `UPDATE expenses SET
         expense_date = $1, financial_year = $2, category_id = $3, vendor_id = $4,
         amount = $5, tax_amount = $6, description = $7, payment_source = $8,
         bank_account_id = $9, cash_account_id = $10, attachment_url = $11,
         updated_by = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        expense_date, fy, category_id, vendor_id || null,
        amount, tax_amount || 0, description || null, payment_source,
        payment_source === 'bank' ? bank_account_id : null,
        payment_source === 'cash' ? cash_account_id : null,
        attachment_url || null, req.user.id, id,
      ]
    );

    // Reverse the old ledger posting and re-post fresh (handles source switch).
    await reverseSourceEntries(client, 'expense', id, req.user.id);
    await postSourceDebit(client, {
      paymentSource: payment_source,
      bankAccountId: bank_account_id,
      cashAccountId: cash_account_id,
      entryDate: expense_date,
      amount: total,
      partyName,
      narration: description || `Expense: ${categoryName} (${upd.rows[0].expense_number})`,
      referenceNumber: reference_number,
      sourceType: 'expense',
      sourceId: id,
      userId: req.user.id,
    });

    await client.query('COMMIT');
    logger.info('Expense updated', { expenseId: id, userId: req.user.id });
    res.json({ success: true, data: { ...upd.rows[0], total_amount: total } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE EXPENSE (soft) ────────────────────────────────────────────────────
const deleteExpense = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    await client.query(
      `UPDATE expenses SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );
    await reverseSourceEntries(client, 'expense', id, req.user.id);

    await client.query('COMMIT');
    logger.info('Expense deleted', { expenseId: id, userId: req.user.id });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── LIST EXPENSES ────────────────────────────────────────────────────────────
const listExpenses = async (req, res, next) => {
  try {
    const {
      from_date, to_date, category_id, vendor_id, payment_source,
      financial_year, search, page = 1, limit = 20,
    } = req.query;

    const params = [];
    const conditions = ['e.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`e.expense_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`e.expense_date <= $${params.length}`); }
    if (category_id) { params.push(category_id); conditions.push(`e.category_id = $${params.length}`); }
    if (vendor_id) { params.push(vendor_id); conditions.push(`e.vendor_id = $${params.length}`); }
    if (payment_source) { params.push(payment_source); conditions.push(`e.payment_source = $${params.length}`); }
    if (financial_year) { params.push(financial_year); conditions.push(`e.financial_year = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.expense_number ILIKE $${params.length} OR e.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*) FROM expenses e WHERE ${whereClause}`, params
    );

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await db.query(
      `SELECT
         e.id, e.expense_number, e.expense_date, e.financial_year,
         e.amount, e.tax_amount, (e.amount + e.tax_amount) AS total_amount,
         e.description, e.payment_source, e.bank_account_id, e.cash_account_id,
         e.category_id, ec.name AS category_name,
         e.vendor_id, v.vendor_name,
         ba.account_name AS bank_account_name,
         ca.account_name AS cash_account_name,
         e.created_at, u.full_name AS created_by_name
       FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN vendors v ON v.id = e.vendor_id
       LEFT JOIN bank_accounts ba ON ba.id = e.bank_account_id
       LEFT JOIN cash_accounts ca ON ca.id = e.cash_account_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${whereClause}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = parseInt(countRes.rows[0].count);
    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── EXPENSE SUMMARY (grouped by category) ────────────────────────────────────
const getExpenseSummary = async (req, res, next) => {
  try {
    const { from_date, to_date, financial_year } = req.query;
    const params = [];
    const conditions = ['e.deleted_at IS NULL'];

    if (from_date) { params.push(from_date); conditions.push(`e.expense_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`e.expense_date <= $${params.length}`); }
    if (financial_year) { params.push(financial_year); conditions.push(`e.financial_year = $${params.length}`); }

    const whereClause = conditions.join(' AND ');

    const byCategory = await db.query(
      `SELECT ec.id AS category_id, ec.name AS category_name,
              COUNT(e.id)::int AS count,
              COALESCE(SUM(e.amount + e.tax_amount), 0) AS total
       FROM expense_categories ec
       LEFT JOIN expenses e ON e.category_id = ec.id AND ${whereClause}
       GROUP BY ec.id, ec.name
       HAVING COUNT(e.id) > 0
       ORDER BY total DESC`,
      params
    );

    const grand = byCategory.rows.reduce((s, r) => s + parseFloat(r.total), 0);

    res.json({
      success: true,
      data: { by_category: byCategory.rows, grand_total: parseFloat(grand.toFixed(2)) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
const listCategories = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const rows = await db.query(
      `SELECT id, name, code, is_active, sort_order
       FROM expense_categories
       ${includeInactive ? '' : 'WHERE is_active = true'}
       ORDER BY sort_order, name`
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, code, sort_order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    const existing = await db.query(`SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1)`, [name.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A category with this name already exists' });
    }
    const result = await db.query(
      `INSERT INTO expense_categories (name, code, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), code || null, sort_order || 0]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, sort_order, is_active } = req.body;
    const existing = await db.query(`SELECT id FROM expense_categories WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    const result = await db.query(
      `UPDATE expense_categories SET
         name = COALESCE($1, name), code = COALESCE($2, code),
         sort_order = COALESCE($3, sort_order), is_active = COALESCE($4, is_active),
         updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name || null, code !== undefined ? code : null, sort_order ?? null, is_active ?? null, id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  postSourceDebit,
  reverseSourceEntries,
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  getExpenseSummary,
  listCategories,
  createCategory,
  updateCategory,
};
