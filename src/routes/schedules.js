const router = require('express').Router();
const ctrl   = require('../controllers/scheduleController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',                    auth, ctrl.getAll);
router.get('/teacher/:teacherId',  auth, ctrl.getByTeacher);
router.post('/',   auth, role('admin','staff'),            ctrl.create);
router.put('/:id', auth, role('admin','staff','teacher'),  ctrl.update);
router.delete('/:id', auth, role('admin','staff'),         ctrl.delete);

module.exports = router;