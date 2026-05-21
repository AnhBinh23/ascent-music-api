const router = require('express').Router();
const ctrl   = require('../controllers/invoiceController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/',                      auth, ctrl.getAll);
router.get('/stats',                 auth, ctrl.getStats);
router.get('/student/:studentId',    auth, ctrl.getByStudent);
router.post('/',                     auth, role('admin','staff'), ctrl.create);
router.put('/:id/confirm-payment',   auth, role('admin','staff'), ctrl.confirmPayment);

module.exports = router;