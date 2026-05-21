const router = require('express').Router();
const ctrl   = require('../controllers/teacherController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',           auth, ctrl.getAll);
router.get('/salary',     auth, role('admin'), ctrl.getSalary);
router.get('/:id',        auth, ctrl.getById);
router.post('/',          auth, role('admin'), ctrl.create);
router.put('/:id',        auth, role('admin'), ctrl.update);
router.delete('/:id',     auth, role('admin'), ctrl.delete);
module.exports = router;