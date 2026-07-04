/**
 * Employee Controller — staff master (salaried + daily-wage workers).
 */

const db = require('../utils/db');
const logger = require('../config/logger');

async function nextEmployeeCode() {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS c FROM employees`);
  return `EMP-${String(rows[0].c + 1).padStart(4, '0')}`;
}

const createEmployee = async (req, res, next) => {
  try {
    const {
      full_name, phone, employee_type, monthly_salary, daily_rate,
      date_of_joining, status, bank_account_name, bank_account_number,
      ifsc_code, upi_id, notes,
    } = req.body;

    const employee_code = await nextEmployeeCode();
    const result = await db.query(
      `INSERT INTO employees
         (employee_code, full_name, phone, employee_type, monthly_salary, daily_rate,
          date_of_joining, status, bank_account_name, bank_account_number, ifsc_code, upi_id, notes,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       RETURNING *`,
      [
        employee_code, full_name, phone || null, employee_type,
        employee_type === 'salaried' ? monthly_salary : null,
        employee_type === 'daily_wage' ? daily_rate : null,
        date_of_joining || null, status || 'active',
        bank_account_name || null, bank_account_number || null, ifsc_code || null, upi_id || null,
        notes || null, req.user.id,
      ]
    );
    logger.info('Employee created', { employeeId: result.rows[0].id });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const listEmployees = async (req, res, next) => {
  try {
    const { employee_type, status, search, page = 1, limit = 20 } = req.query;
    const params = [];
    const conditions = ['e.deleted_at IS NULL'];

    if (employee_type) { params.push(employee_type); conditions.push(`e.employee_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
    }
    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*) FROM employees e WHERE ${whereClause}`, params);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit));
    params.push(offset);

    const rows = await db.query(
      `SELECT e.*,
         COALESCE((SELECT SUM(amount - amount_recovered) FROM employee_advances a
                   WHERE a.employee_id = e.id AND a.status = 'outstanding' AND a.deleted_at IS NULL), 0) AS outstanding_advance
       FROM employees e
       WHERE ${whereClause}
       ORDER BY e.full_name
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

const getEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT * FROM employees WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      full_name, phone, employee_type, monthly_salary, daily_rate,
      date_of_joining, status, bank_account_name, bank_account_number,
      ifsc_code, upi_id, notes,
    } = req.body;

    const existing = await db.query(`SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

    const result = await db.query(
      `UPDATE employees SET
         full_name = $1, phone = $2, employee_type = $3,
         monthly_salary = $4, daily_rate = $5, date_of_joining = $6, status = $7,
         bank_account_name = $8, bank_account_number = $9, ifsc_code = $10, upi_id = $11,
         notes = $12, updated_by = $13, updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        full_name, phone || null, employee_type,
        employee_type === 'salaried' ? monthly_salary : null,
        employee_type === 'daily_wage' ? daily_rate : null,
        date_of_joining || null, status || 'active',
        bank_account_name || null, bank_account_number || null, ifsc_code || null, upi_id || null,
        notes || null, req.user.id, id,
      ]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query(`SELECT id FROM employees WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

    await db.query(`UPDATE employees SET deleted_at = NOW(), deleted_by = $1, updated_by = $1 WHERE id = $2`, [req.user.id, id]);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createEmployee, listEmployees, getEmployee, updateEmployee, deleteEmployee };
