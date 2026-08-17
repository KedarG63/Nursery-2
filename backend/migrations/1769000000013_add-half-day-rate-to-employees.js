/* eslint-disable camelcase */

/**
 * Migration: add `half_day_rate` to employees.
 *
 * Wages were computed as SUM(attendance.units) * daily_rate, and a half day is
 * hardcoded to 0.5 units — so a half day was structurally locked to exactly 50%
 * of a full day. The nursery pays a half day at a rate that is NOT half the full
 * rate (e.g. full 330, half 250), which that model cannot express: the required
 * unit fraction (250/330 = 0.7575…) does not fit `units numeric(5,2)`.
 *
 * This adds an explicit per-employee half-day rate. The payroll calculation uses
 * it only for attendance rows with status = 'half_day' AND a non-null
 * half_day_rate; otherwise it falls back to the existing units * daily_rate.
 * Every existing employee therefore behaves exactly as before until a rate is set.
 *
 * Safety: purely additive (one nullable column), no data rewritten, reversible.
 * Setting the actual rates is a deliberate, separate step — see
 * scripts/set-daily-wage-rates.sql.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('employees', {
    half_day_rate: {
      type: 'numeric(12,2)',
      comment: 'Amount paid for a half day. NULL = fall back to 0.5 x daily_rate.',
    },
  }, { ifNotExists: true });

  pgm.addConstraint('employees', 'chk_employees_half_day_rate_positive', {
    check: 'half_day_rate IS NULL OR half_day_rate > 0',
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('employees', 'chk_employees_half_day_rate_positive', { ifExists: true });
  pgm.dropColumns('employees', ['half_day_rate'], { ifExists: true });
};
