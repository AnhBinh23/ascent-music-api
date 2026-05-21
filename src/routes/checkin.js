const router = require('express').Router();
const ctrl   = require('../controllers/checkinController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',                       auth, role('admin'), ctrl.getAll);
router.get('/teacher/:teacherId',     auth, ctrl.getByTeacher);
router.post('/',                      auth, role('teacher'), ctrl.create);
module.exports = router;