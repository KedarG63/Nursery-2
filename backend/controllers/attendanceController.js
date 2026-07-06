/**
 * Attendance Controller
 *
 * Two uses:
 *  - Daily-wage labourers: mark days worked (present / half day / absent). Drives
 *    wages = SUM(units) * daily_rate for the period.
 *  - Salaried staff: exception-based leave log. Present days are assumed; only
 *    leave is recorded — paid_leave (no deduction) or unpaid_leave (deducted).
 *    Half-day leave = units 0.5.
 */

const pool = require('../config/database');
const db = require('../utils/db');

const DEFAULT_UNITS = { present: 1, half_day: 0.5, paid_leave: 1, unpaid_leave: 1, absent: 0 };

// Upsert a single attendance / leave record.
const markAttendance = async (req, res, next) => {
  try {
    const { employee_id, work_date, status = 'present', units, notes } = req.body;
    if (!employee_id || !work_date) {
      return res.status(400).json({ success: false, message: 'employee_id and work_date are required' });
    }
    const u = units !== undefined && units !== null && units !== '' ? Number(units) : (DEFAULT_UNITS[status] ?? 1);

    const result = await db.query(
      `INSERT INTO employee_attendance (employee_id, work_date, status, units, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET status = EXCLUDED.status, units = EXCLUDED.units, notes = EXCLUDED.notes,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [employee_id, work_date, status, u, notes || null, req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// Bulk upsert for a single date across multiple employees (labourer roster).
const bulkMarkAttendance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { work_date, entries } = req.body;
    if (!work_date || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'work_date and a non-empty entries array are required' });
    }

    await client.query('BEGIN');
    let count = 0;
    for (const e of entries) {
      if (!e.employee_id) continue;
      const status = e.status || 'present';
      const u = e.units !== undefined && e.units !== null && e.units !== '' ? Number(e.units) : (DEFAULT_UNITS[status] ?? 1);
      await client.query(
        `INSERT INTO employee_attendance (employee_id, work_date, status, units, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (employee_id, work_date)
         DO UPDATE SET status = EXCLUDED.status, units = EXCLUDED.units, notes = EXCLUDED.notes,
                       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [e.employee_id, work_date, status, u, e.notes || null, req.user.id]
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Attendance saved for ${count} worker(s)`, count });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// List attendance.
//   ?work_date=X                      -> labourer roster for that date (active daily_wage)
//   ?employee_type=salaried&from&to   -> salaried leave records in a range
//   ?employee_id=..&from&to           -> one employee's records
const listAttendance = async (req, res, next) => {
  try {
    const { employee_id, work_date, from_date, to_date, employee_type } = req.query;

    if (work_date && !employee_id) {
      const rows = await db.query(
        `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.daily_rate,
                a.id AS attendance_id, a.status, a.units, a.notes
         FROM employees e
         LEFT JOIN employee_attendance a ON a.employee_id = e.id AND a.work_date = $1
         WHERE e.deleted_at IS NULL AND e.status = 'active' AND e.employee_type = 'daily_wage'
         ORDER BY e.full_name`,
        [work_date]
      );
      return res.json({ success: true, data: rows.rows });
    }

    const params = [];
    const conditions = ['e.deleted_at IS NULL'];
    if (employee_id) { params.push(employee_id); conditions.push(`a.employee_id = $${params.length}`); }
    if (employee_type) { params.push(employee_type); conditions.push(`e.employee_type = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`a.work_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`a.work_date <= $${params.length}`); }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = await db.query(
      `SELECT a.id, a.employee_id, a.work_date, a.status, a.units, a.notes,
              e.full_name, e.employee_code, e.employee_type
       FROM employee_attendance a
       JOIN employees e ON e.id = a.employee_id
       ${whereClause}
       ORDER BY a.work_date DESC, e.full_name
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
};

// Remove an attendance / leave record (used to undo a salaried leave entry).
const deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(`DELETE FROM employee_attendance WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    res.json({ success: true, message: 'Attendance record removed' });
  } catch (err) {
    next(err);
  }
};

module.exports = { markAttendance, bulkMarkAttendance, listAttendance, deleteAttendance };
