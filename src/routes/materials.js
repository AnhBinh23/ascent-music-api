const router = require('express').Router();
const ctrl   = require('../controllers/materialController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',                   auth, ctrl.getAll);
router.get('/class/:classId',     auth, ctrl.getByClass);
router.get('/student/:studentId', auth, ctrl.getByStudent);
router.post('/',                  auth, role('teacher','admin'), ctrl.create);
router.delete('/:id',             auth, role('teacher','admin'), ctrl.delete);

module.exports = router;