/**
 * Employee Validation Middleware
 */

const EMPLOYEE_TYPES = ['salaried', 'daily_wage'];

const validateEmployee = (req, res, next) => {
  const { full_name, employee_type, monthly_salary, daily_rate, half_day_rate } = req.body;
  const errors = [];

  if (!full_name || !full_name.trim()) errors.push('full_name is required');
  if (!EMPLOYEE_TYPES.includes(employee_type)) {
    errors.push(`employee_type is required and must be one of: ${EMPLOYEE_TYPES.join(', ')}`);
  } else if (employee_type === 'salaried') {
    if (monthly_salary === undefined || monthly_salary === null || Number(monthly_salary) <= 0) {
      errors.push('monthly_salary (> 0) is required for salaried employees');
    }
  } else if (employee_type === 'daily_wage') {
    if (daily_rate === undefined || daily_rate === null || Number(daily_rate) <= 0) {
      errors.push('daily_rate (> 0) is required for daily-wage workers');
    }
    // Optional — blank means a half day falls back to half the daily rate.
    if (half_day_rate !== undefined && half_day_rate !== null && half_day_rate !== ''
        && !(Number(half_day_rate) > 0)) {
      errors.push('half_day_rate must be greater than 0 when provided');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  next();
};

module.exports = { validateEmployee, EMPLOYEE_TYPES };
