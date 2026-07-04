/**
 * Attendance Routes — per-day attendance for daily-wage workers.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const ctrl = require('../controllers/attendanceController');

const FINANCE = ['Admin', 'Manager', 'Accountant'];

router.use(authenticate);

router.get('/', authorize(FINANCE), ctrl.listAttendance);
router.post('/', authorize(FINANCE), ctrl.markAttendance);
router.post('/bulk', authorize(FINANCE), ctrl.bulkMarkAttendance);

module.exports = router;
