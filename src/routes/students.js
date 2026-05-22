const router = require('express').Router();
const ctrl   = require('../controllers/studentController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/',       auth, ctrl.getAll);
router.get('/search', auth, ctrl.search);

// Tìm học viên theo user_id
router.get('/by-user/:userId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE user_id = ?',
      [req.params.userId]
    );
    res.json({ success: true, row: rows[0] || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id',    auth, ctrl.getById);
router.post('/',      auth, role('admin','staff'), ctrl.create);
router.put('/:id',    auth, role('admin','staff'), ctrl.update);
router.delete('/:id', auth, role('admin','staff'), ctrl.delete);
module.exports = router;