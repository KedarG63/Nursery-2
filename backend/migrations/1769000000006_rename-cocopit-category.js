/* eslint-disable camelcase */

/**
 * Migration: Fix the spelling of the seeded "Cocopit" expense category → "Cocopeat".
 *
 * Pure data correction on the expense_categories master — no schema change.
 * Existing expenses reference the category by id (unchanged), so their links,
 * ledger postings and totals are unaffected; only the display name/code change.
 *
 * Idempotent & production-safe:
 *   - Only touches a row still named 'Cocopit'.
 *   - Guarded by NOT EXISTS so it never collides with the name unique index
 *     (e.g. on a fresh DB where migration 003 already seeds 'Cocopeat').
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE expense_categories
    SET name = 'Cocopeat', code = 'COCOPEAT', updated_at = NOW()
    WHERE name = 'Cocopit'
      AND NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Cocopeat');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE expense_categories
    SET name = 'Cocopit', code = 'COCOPIT', updated_at = NOW()
    WHERE name = 'Cocopeat'
      AND NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Cocopit');
  `);
};
