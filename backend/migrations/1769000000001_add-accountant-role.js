/* eslint-disable camelcase */

/**
 * Migration: Add "Accountant" role
 *
 * Adds a dedicated Accountant role for the new accounting suite
 * (expenses, cash-in-hand, deposits, payroll, financial dashboards).
 *
 * Purely additive — existing roles and role assignments are untouched.
 * Idempotent: ON CONFLICT DO NOTHING so re-running is safe.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO roles (name, description)
    VALUES ('Accountant', 'Manage expenses, cash, bank, payroll and financial reports')
    ON CONFLICT (name) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  // Remove the role only if no users are still assigned to it (safety).
  pgm.sql(`
    DELETE FROM roles r
    WHERE r.name = 'Accountant'
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.role_id = r.id
      );
  `);
};
