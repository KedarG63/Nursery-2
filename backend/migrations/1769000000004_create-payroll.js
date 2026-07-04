/* eslint-disable camelcase */

/**
 * Migration: Payroll, Daily Wages & Advances (Phase 2 of Accounting Suite)
 *
 * Purely additive — creates NEW tables/enums only.
 *
 * Tables:
 *   - employees           : salaried staff + daily-wage workers
 *   - employee_attendance  : per-day attendance (drives daily-wage payable)
 *   - payroll_runs         : a salary/wages run for a month
 *   - payroll_items        : per-employee line in a run; paying posts a cash/bank DEBIT
 *   - employee_advances    : advances given to staff; paying posts a cash/bank DEBIT,
 *                            recovered by deduction from payroll items
 *
 * Error-free design: every payout (payroll net, advance) selects exactly one payment
 * source (cash/bank) and the application posts the matching ledger DEBIT atomically.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── ENUMs ──────────────────────────────────────────────────────────────────
  pgm.createType('employee_type_enum', ['salaried', 'daily_wage']);
  pgm.createType('employee_status_enum', ['active', 'inactive']);
  pgm.createType('attendance_status_enum', ['present', 'absent', 'half_day', 'paid_leave']);
  pgm.createType('payroll_run_type_enum', ['salary', 'wages']);
  pgm.createType('payroll_run_status_enum', ['draft', 'finalized', 'paid']);
  pgm.createType('payroll_item_status_enum', ['pending', 'paid']);
  pgm.createType('payout_source_enum', ['cash', 'bank']);
  pgm.createType('advance_status_enum', ['outstanding', 'recovered']);

  // ── employees ────────────────────────────────────────────────────────────────
  pgm.createTable('employees', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    employee_code: { type: 'varchar(20)', notNull: true, unique: true, comment: 'EMP-XXXX' },
    full_name: { type: 'varchar(150)', notNull: true },
    phone: { type: 'varchar(20)' },
    employee_type: { type: 'employee_type_enum', notNull: true },
    monthly_salary: { type: 'numeric(12,2)', comment: 'For salaried employees' },
    daily_rate: { type: 'numeric(12,2)', comment: 'For daily-wage workers' },
    date_of_joining: { type: 'date' },
    status: { type: 'employee_status_enum', notNull: true, default: 'active' },
    bank_account_name: { type: 'varchar(150)' },
    bank_account_number: { type: 'varchar(30)' },
    ifsc_code: { type: 'varchar(20)' },
    upi_id: { type: 'varchar(100)' },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('employees', 'status', { name: 'idx_employees_status' });
  pgm.createIndex('employees', 'employee_type', { name: 'idx_employees_type' });
  pgm.createIndex('employees', 'deleted_at', { name: 'idx_employees_deleted_at', where: 'deleted_at IS NULL' });

  // A salaried employee needs monthly_salary; a daily-wage worker needs daily_rate.
  pgm.addConstraint('employees', 'chk_employees_rate', {
    check: `
      (employee_type = 'salaried'   AND monthly_salary IS NOT NULL)
      OR
      (employee_type = 'daily_wage' AND daily_rate IS NOT NULL)
    `,
  });

  pgm.createTrigger('employees', 'update_employees_updated_at', {
    when: 'BEFORE', operation: 'UPDATE', function: 'update_updated_at_column', level: 'ROW',
  });

  // ── employee_attendance ──────────────────────────────────────────────────────
  pgm.createTable('employee_attendance', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    employee_id: { type: 'uuid', notNull: true, references: 'employees', onDelete: 'CASCADE' },
    work_date: { type: 'date', notNull: true },
    status: { type: 'attendance_status_enum', notNull: true, default: 'present' },
    units: { type: 'numeric(5,2)', notNull: true, default: 1, comment: 'Days/shifts worked (e.g. 0.5 for half day)' },
    notes: { type: 'varchar(300)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('employee_attendance', 'uq_attendance_emp_date', { unique: ['employee_id', 'work_date'] });
  pgm.createIndex('employee_attendance', 'work_date', { name: 'idx_attendance_date' });
  pgm.addConstraint('employee_attendance', 'chk_attendance_units', { check: 'units >= 0' });

  pgm.createTrigger('employee_attendance', 'update_attendance_updated_at', {
    when: 'BEFORE', operation: 'UPDATE', function: 'update_updated_at_column', level: 'ROW',
  });

  // ── payroll_runs ─────────────────────────────────────────────────────────────
  pgm.createTable('payroll_runs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    run_number: { type: 'varchar(20)', notNull: true, unique: true, comment: 'PR-YYYYMM-XXXX' },
    period_month: { type: 'smallint', notNull: true, comment: '1-12' },
    period_year: { type: 'smallint', notNull: true },
    run_type: { type: 'payroll_run_type_enum', notNull: true },
    status: { type: 'payroll_run_status_enum', notNull: true, default: 'draft' },
    financial_year: { type: 'varchar(7)', notNull: true },
    total_gross: { type: 'numeric(14,2)', notNull: true, default: 0 },
    total_advance_deducted: { type: 'numeric(14,2)', notNull: true, default: 0 },
    total_net: { type: 'numeric(14,2)', notNull: true, default: 0 },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('payroll_runs', ['period_year', 'period_month'], { name: 'idx_payroll_runs_period' });
  pgm.createIndex('payroll_runs', 'deleted_at', { name: 'idx_payroll_runs_deleted_at', where: 'deleted_at IS NULL' });

  pgm.createTrigger('payroll_runs', 'update_payroll_runs_updated_at', {
    when: 'BEFORE', operation: 'UPDATE', function: 'update_updated_at_column', level: 'ROW',
  });

  // ── payroll_items ────────────────────────────────────────────────────────────
  pgm.createTable('payroll_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    payroll_run_id: { type: 'uuid', notNull: true, references: 'payroll_runs', onDelete: 'CASCADE' },
    employee_id: { type: 'uuid', notNull: true, references: 'employees', onDelete: 'RESTRICT' },
    gross_amount: { type: 'numeric(12,2)', notNull: true, default: 0 },
    days_worked: { type: 'numeric(6,2)', comment: 'For daily-wage; null for salaried' },
    advance_deducted: { type: 'numeric(12,2)', notNull: true, default: 0 },
    net_amount: { type: 'numeric(12,2)', notNull: true, default: 0 },
    status: { type: 'payroll_item_status_enum', notNull: true, default: 'pending' },
    payment_source: { type: 'payout_source_enum' },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    paid_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('payroll_items', 'uq_payroll_item_run_emp', { unique: ['payroll_run_id', 'employee_id'] });
  pgm.createIndex('payroll_items', 'employee_id', { name: 'idx_payroll_items_employee' });
  pgm.addConstraint('payroll_items', 'chk_payroll_item_amounts', { check: 'gross_amount >= 0 AND advance_deducted >= 0 AND net_amount >= 0' });

  // When paid, exactly one payment source must be set, consistent with payment_source.
  pgm.addConstraint('payroll_items', 'chk_payroll_item_source', {
    check: `
      status = 'pending'
      OR (
        (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
        OR
        (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
      )
    `,
  });

  pgm.createTrigger('payroll_items', 'update_payroll_items_updated_at', {
    when: 'BEFORE', operation: 'UPDATE', function: 'update_updated_at_column', level: 'ROW',
  });

  // ── employee_advances ────────────────────────────────────────────────────────
  pgm.createTable('employee_advances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    advance_number: { type: 'varchar(20)', notNull: true, unique: true, comment: 'ADV-YYYYMMDD-XXXX' },
    employee_id: { type: 'uuid', notNull: true, references: 'employees', onDelete: 'RESTRICT' },
    advance_date: { type: 'date', notNull: true },
    financial_year: { type: 'varchar(7)', notNull: true },
    amount: { type: 'numeric(12,2)', notNull: true },
    amount_recovered: { type: 'numeric(12,2)', notNull: true, default: 0 },
    status: { type: 'advance_status_enum', notNull: true, default: 'outstanding' },
    payment_source: { type: 'payout_source_enum', notNull: true },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'RESTRICT' },
    cash_account_id: { type: 'uuid', references: 'cash_accounts', onDelete: 'RESTRICT' },
    notes: { type: 'varchar(500)' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    updated_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createIndex('employee_advances', 'employee_id', { name: 'idx_advances_employee' });
  pgm.createIndex('employee_advances', 'status', { name: 'idx_advances_status' });
  pgm.createIndex('employee_advances', 'deleted_at', { name: 'idx_advances_deleted_at', where: 'deleted_at IS NULL' });

  pgm.addConstraint('employee_advances', 'chk_advance_amount', { check: 'amount > 0 AND amount_recovered >= 0 AND amount_recovered <= amount' });
  pgm.addConstraint('employee_advances', 'chk_advance_source', {
    check: `
      (payment_source = 'bank' AND bank_account_id IS NOT NULL AND cash_account_id IS NULL)
      OR
      (payment_source = 'cash' AND cash_account_id IS NOT NULL AND bank_account_id IS NULL)
    `,
  });

  pgm.createTrigger('employee_advances', 'update_advances_updated_at', {
    when: 'BEFORE', operation: 'UPDATE', function: 'update_updated_at_column', level: 'ROW',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('employee_advances', { ifExists: true, cascade: true });
  pgm.dropTable('payroll_items', { ifExists: true, cascade: true });
  pgm.dropTable('payroll_runs', { ifExists: true, cascade: true });
  pgm.dropTable('employee_attendance', { ifExists: true, cascade: true });
  pgm.dropTable('employees', { ifExists: true, cascade: true });

  pgm.dropType('advance_status_enum', { ifExists: true });
  pgm.dropType('payout_source_enum', { ifExists: true });
  pgm.dropType('payroll_item_status_enum', { ifExists: true });
  pgm.dropType('payroll_run_status_enum', { ifExists: true });
  pgm.dropType('payroll_run_type_enum', { ifExists: true });
  pgm.dropType('attendance_status_enum', { ifExists: true });
  pgm.dropType('employee_status_enum', { ifExists: true });
  pgm.dropType('employee_type_enum', { ifExists: true });
};
