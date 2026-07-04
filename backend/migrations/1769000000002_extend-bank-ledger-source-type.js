/* eslint-disable camelcase */

/**
 * Migration: Extend bank_ledger_source_type_enum
 *
 * Adds new source types so that bank-paid expenses, payroll/wage payouts,
 * staff advances, and cash->bank deposits can be auto-recorded as debits/
 * credits in the EXISTING Bank Ledger (no parallel bank book is created).
 *
 * Production-safety notes:
 *   - ALTER TYPE ... ADD VALUE is a non-destructive, backward-compatible
 *     change. Existing rows and queries are unaffected.
 *   - PostgreSQL 12+ permits ADD VALUE inside a transaction as long as the
 *     new value is not USED in the same transaction (it isn't here — only
 *     application code uses these values at runtime).
 *   - addTypeValue with ifNotExists makes this idempotent / re-runnable.
 *   - Down is intentionally a no-op: PostgreSQL cannot drop an enum value
 *     without recreating the type (risky on a live table). Leaving unused
 *     enum values in place is harmless.
 */

exports.shorthands = undefined;

const NEW_VALUES = ['expense', 'payroll', 'advance', 'cash_deposit'];

exports.up = (pgm) => {
  NEW_VALUES.forEach((value) => {
    pgm.addTypeValue('bank_ledger_source_type_enum', value, { ifNotExists: true });
  });
};

exports.down = () => {
  // No-op. Dropping enum values is unsafe on a live table; unused values
  // cause no harm. See header note.
};
