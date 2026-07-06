/* eslint-disable camelcase */

/**
 * Migration: Salaried leave + flexible wage periods (additive)
 *
 *  - Adds 'unpaid_leave' to attendance_status_enum so salaried staff leave can be
 *    marked as paid (no deduction) or unpaid (deducted from salary).
 *  - Adds leave-deduction columns to payroll_items for transparent payslips.
 *  - Adds period_start / period_end to payroll_runs so wage (labourer) runs can
 *    cover any date range (e.g. a week) while salary runs stay monthly.
 *
 * Purely additive. `down` removes the new columns; the enum value is left in
 * place (dropping an enum value is unsafe on a live table and harmless unused).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addTypeValue('attendance_status_enum', 'unpaid_leave', { ifNotExists: true });

  pgm.addColumns('payroll_items', {
    unpaid_leave_days: { type: 'numeric(6,2)', comment: 'Unpaid leave days deducted (salaried)' },
    leave_deducted: { type: 'numeric(12,2)', notNull: true, default: 0, comment: 'Amount deducted for unpaid leave' },
  });

  pgm.addColumns('payroll_runs', {
    period_start: { type: 'date', comment: 'Start of pay period (wage runs use a date range)' },
    period_end: { type: 'date', comment: 'End of pay period' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('payroll_runs', ['period_start', 'period_end'], { ifExists: true });
  pgm.dropColumns('payroll_items', ['unpaid_leave_days', 'leave_deducted'], { ifExists: true });
  // attendance_status_enum 'unpaid_leave' intentionally left in place.
};
