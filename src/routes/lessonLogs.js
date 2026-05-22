const router = require('express').Router();
const ctrl   = require('../controllers/lessonLogController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/class/:classId',     auth, ctrl.getByClass);
router.get('/teacher/:teacherId', auth, ctrl.getByTeacher);
router.get('/student/:studentId', auth, ctrl.getByStudent);
router.post('/',                  auth, role('teacher'), ctrl.create);
router.put('/:id',                auth, role('teacher'), ctrl.update);
router.delete('/:id',             auth, role('teacher'), ctrl.delete);

module.exports = router;