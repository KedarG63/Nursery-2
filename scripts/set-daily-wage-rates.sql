-- ============================================================================
-- Set daily-wage rates: full day 330, half day 250
-- ============================================================================
--
-- Deliberately NOT a migration. Migrations run automatically on deploy; changing
-- what people get paid should be an explicit, reviewed act with a backup taken
-- first. Requires migration 1769000000013 (adds employees.half_day_rate).
--
-- RETROACTIVE EFFECT: payroll_items freeze gross_amount when a run is created,
-- so runs already created or paid are untouched. But any attendance already
-- recorded for a period with no wage run yet will be paid at the NEW rates.
-- Run section 1 first to see exactly what that covers.
--
-- Usage on the production VM:
--   docker compose exec -T -u postgres postgres pg_dump -U nursery_user nursery_db > ~/backup-before-rates.sql
--   docker compose cp scripts/set-daily-wage-rates.sql postgres:/tmp/rates.sql
--   docker compose exec -T -u postgres postgres psql -U nursery_user -d nursery_db -f /tmp/rates.sql
-- ============================================================================


-- ── 1. BEFORE: what changes, and what unpaid attendance is exposed ──────────

\echo '--- Current daily-wage rates ---'
SELECT employee_code, full_name, daily_rate, half_day_rate, date_of_joining
FROM employees
WHERE deleted_at IS NULL AND status = 'active' AND employee_type = 'daily_wage'
ORDER BY full_name;

\echo '--- Attendance not yet covered by any wage run (will be paid at NEW rates) ---'
SELECT MIN(a.work_date) AS from_date,
       MAX(a.work_date) AS to_date,
       COUNT(*) FILTER (WHERE a.status = 'present')  AS full_days,
       COUNT(*) FILTER (WHERE a.status = 'half_day') AS half_days
FROM employee_attendance a
JOIN employees e ON e.id = a.employee_id
WHERE e.employee_type = 'daily_wage'
  AND NOT EXISTS (
    SELECT 1 FROM payroll_runs pr
    WHERE pr.run_type = 'wages' AND pr.deleted_at IS NULL
      AND pr.period_start IS NOT NULL AND pr.period_end IS NOT NULL
      AND a.work_date BETWEEN pr.period_start AND pr.period_end
  );


-- ── 2. APPLY ────────────────────────────────────────────────────────────────
-- Scoped to active, non-deleted daily-wage workers. Salaried staff are never
-- touched (their daily_rate is NULL and the chk_employees_rate constraint
-- requires monthly_salary instead).

BEGIN;

UPDATE employees
   SET daily_rate    = 330,
       half_day_rate = 250,
       updated_at    = NOW()
 WHERE deleted_at IS NULL
   AND status = 'active'
   AND employee_type = 'daily_wage';

-- ── 3. AFTER: verify before committing ──────────────────────────────────────
\echo '--- New rates (review, then COMMIT or ROLLBACK) ---'
SELECT employee_code, full_name, daily_rate, half_day_rate
FROM employees
WHERE deleted_at IS NULL AND status = 'active' AND employee_type = 'daily_wage'
ORDER BY full_name;

COMMIT;
-- If the output above looks wrong, run ROLLBACK; instead of COMMIT;
