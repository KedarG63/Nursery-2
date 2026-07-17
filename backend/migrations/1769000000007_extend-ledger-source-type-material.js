/* eslint-disable camelcase */

/**
 * Migration: Extend bank_ledger + cash_ledger source_type enums with
 * 'material_purchase'.
 *
 * Lets tranche payments made against a Supplies/Materials purchase be
 * auto-recorded as DEBITs in the existing Bank Ledger or Cash book
 * (self-reconciling, same pattern as expenses/payroll/deposits).
 *
 * Production-safety notes:
 *   - ALTER TYPE ... ADD VALUE is non-destructive and backward-compatible;
 *     existing rows/queries are unaffected.
 *   - addTypeValue with ifNotExists makes this idempotent / re-runnable.
 *   - Down is intentionally a no-op: PostgreSQL cannot drop an enum value
 *     without recreating the type (risky on a live table). Leaving an unused
 *     enum value in place is harmless.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addTypeValue('bank_ledger_source_type_enum', 'material_purchase', { ifNotExists: true });
  pgm.addTypeValue('cash_ledger_source_type_enum', 'material_purchase', { ifNotExists: true });
};

exports.down = () => {
  // No-op. Dropping enum values is unsafe on a live table; unused values
  // cause no harm.
};
