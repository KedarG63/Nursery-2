/**
 * Report Controller
 * Phase 15: Reports & Analytics API endpoints
 * Issues #70-#74
 */

const salesReportService = require('../services/salesReportService');
const inventoryReportService = require('../services/inventoryReportService');
const deliveryReportService = require('../services/deliveryReportService');
const customerReportService = require('../services/customerReportService');
const financialReportService = require('../services/financialReportService');

/**
 * Validate date format (YYYY-MM-DD)
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid
 */
function isValidDate(dateString) {
  if (!dateString) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Validate group_by parameter
 * @param {string} groupBy - Grouping interval
 * @returns {boolean} True if valid
 */
function isValidGroupBy(groupBy) {
  return ['day', 'week', 'month'].includes(groupBy);
}

/**
 * Get default date range (last 30 days)
 * @returns {Object} Start and end dates
 */
function getDefaultDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

/**
 * Issue #70: Get sales report
 * GET /api/reports/sales
 */
async function getSalesReport(req, res) {
  try {
    let { start_date, end_date, group_by = 'day' } = req.query;

    // Use default date range if not provided
    if (!start_date || !end_date) {
      const defaults = getDefaultDateRange();
      start_date = start_date || defaults.startDate;
      end_date = end_date || defaults.endDate;
    }

    // Validate dates
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Validate group_by
    if (!isValidGroupBy(group_by)) {
      return res.status(400).json({
        error: 'Invalid group_by parameter',
        message: 'group_by must be one of: day, week, month'
      });
    }

    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'start_date must be before end_date'
      });
    }

    const report = await salesReportService.getSalesAnalytics(start_date, end_date, group_by);

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: start_date,
        endDate: end_date,
        groupBy: group_by
      }
    });
  } catch (error) {
    console.error('Sales report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: error.message
    });
  }
}

/**
 * Issue #71: Get inventory report
 * GET /api/reports/inventory
 */
async function getInventoryReport(req, res) {
  try {
    const report = await inventoryReportService.getInventoryAnalytics();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Inventory report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: error.message
    });
  }
}

/**
 * Issue #72: Get delivery performance report
 * GET /api/reports/delivery
 */
async function getDeliveryReport(req, res) {
  try {
    let { start_date, end_date, driver_id } = req.query;

    // Use default date range if not provided
    if (!start_date || !end_date) {
      const defaults = getDefaultDateRange();
      start_date = start_date || defaults.startDate;
      end_date = end_date || defaults.endDate;
    }

    // Validate dates
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'start_date must be before end_date'
      });
    }

    const report = await deliveryReportService.getDeliveryAnalytics(
      start_date,
      end_date,
      driver_id || null
    );

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: start_date,
        endDate: end_date,
        driverId: driver_id || null
      }
    });
  } catch (error) {
    console.error('Delivery report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: error.message
    });
  }
}

/**
 * Issue #73: Get customer analytics report
 * GET /api/reports/customers
 */
async function getCustomerReport(req, res) {
  try {
    let { start_date, end_date } = req.query;

    // Use default date range if not provided
    if (!start_date || !end_date) {
      const defaults = getDefaultDateRange();
      start_date = start_date || defaults.startDate;
      end_date = end_date || defaults.endDate;
    }

    // Validate dates
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'start_date must be before end_date'
      });
    }

    const report = await customerReportService.getCustomerAnalytics(start_date, end_date);

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: start_date,
        endDate: end_date
      }
    });
  } catch (error) {
    console.error('Customer report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: error.message
    });
  }
}

/**
 * Issue #74: Get financial summary report
 * GET /api/reports/financial
 */
async function getFinancialReport(req, res) {
  try {
    let { start_date, end_date, group_by = 'day' } = req.query;

    // Use default date range if not provided
    if (!start_date || !end_date) {
      const defaults = getDefaultDateRange();
      start_date = start_date || defaults.startDate;
      end_date = end_date || defaults.endDate;
    }

    // Validate dates
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in YYYY-MM-DD format'
      });
    }

    // Validate group_by
    if (!isValidGroupBy(group_by)) {
      return res.status(400).json({
        error: 'Invalid group_by parameter',
        message: 'group_by must be one of: day, week, month'
      });
    }

    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'start_date must be before end_date'
      });
    }

    const report = await financialReportService.getFinancialSummary(
      start_date,
      end_date,
      group_by
    );

    res.json({
      success: true,
      data: report,
      meta: {
        startDate: start_date,
        endDate: end_date,
        groupBy: group_by
      }
    });
  } catch (error) {
    console.error('Financial report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: error.message
    });
  }
}

module.exports = {
  getSalesReport,
  getInventoryReport,
  getDeliveryReport,
  getCustomerReport,
  getFinancialReport
};
