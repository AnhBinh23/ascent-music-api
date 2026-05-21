const router = require('express').Router();
const ctrl   = require('../controllers/studentController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',          auth, ctrl.getAll);
router.get('/search',    auth, ctrl.search);
router.get('/:id',       auth, ctrl.getById);
router.post('/',         auth, role('admin','staff'), ctrl.create);
router.put('/:id',       auth, role('admin','staff'), ctrl.update);
router.delete('/:id',    auth, role('admin'),         ctrl.delete);

module.exports = router;