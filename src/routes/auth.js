const router = require('express').Router();
const ctrl   = require('../controllers/authController');
const auth   = require('../middleware/auth');
const db     = require('../models/db');

router.post('/login',    ctrl.login);
router.post('/register', ctrl.register);
router.get('/me',  auth, ctrl.getMe);
router.put('/password', auth, ctrl.changePassword);

// Cập nhật thông tin cá nhân
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    await db.query(
      'UPDATE users SET name = ?, phone = ?, email = ? WHERE id = ?',
      [name, phone, email, req.user.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;