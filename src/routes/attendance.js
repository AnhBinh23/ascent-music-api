const router = require('express').Router();
const ctrl   = require('../controllers/attendanceController');
const auth   = require('../middleware/auth');

router.get('/class/:classId',         auth, ctrl.getByClass);
router.get('/student/:studentId',     auth, ctrl.getByStudent);
router.get('/stats/:studentId',       auth, ctrl.getStats);
router.post('/',                      auth, ctrl.save);
module.exports = router;