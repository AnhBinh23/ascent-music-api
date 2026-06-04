const router  = require('express').Router();
const ctrl    = require('../controllers/authController');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const db      = require('../models/db');
const bcrypt  = require('bcryptjs');

router.post('/login',    ctrl.login);
router.post('/register', ctrl.register);
router.get('/me',        auth, ctrl.getMe);
router.put('/password',  auth, ctrl.changePassword);

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    await db.query(
      'UPDATE users SET name=?, phone=?, email=? WHERE id=?',
      [name, phone, email, req.user.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/auth/accounts?role=teacher|student — danh sách tài khoản
router.get('/accounts', auth, role('admin'), async (req, res) => {
  try {
    const { role: filterRole } = req.query;
    let query = `
      SELECT
        u.id, u.name, u.email, u.role, u.status,
        u.created_at, u.password_updated_at
      FROM users u
      WHERE u.role NOT IN ('admin','staff')
    `;
    const params = [];
    if (filterRole) { query += ' AND u.role = ?'; params.push(filterRole); }
    query += ' ORDER BY u.role ASC, u.name ASC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/auth/accounts/:userId/status — khóa/mở tài khoản
router.patch('/accounts/:userId/status', auth, role('admin'), async (req, res) => {
  try {
    const { status } = req.body; // 'active' | 'inactive'
    await db.query('UPDATE users SET status=? WHERE id=?', [status, req.params.userId]);
    res.json({ success: true, message: status === 'active' ? 'Đã mở tài khoản!' : 'Đã khóa tài khoản!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/auth/create-account — admin tạo tài khoản cho GV/HV
router.post('/create-account', auth, role('admin'), async (req, res) => {
  try {
    const { link_id, link_type, name, email, password } = req.body;
    if (!link_id || !link_type || !email || !password) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc!' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự!' });
    }
    const [exists] = await db.query('SELECT id FROM users WHERE email=?', [email]);
    if (exists.length) {
      return res.status(400).json({ message: 'Email này đã được sử dụng!' });
    }
    const user_id  = `${link_type}-${link_id}`;
    const userRole = link_type;
    const hash     = await bcrypt.hash(password, 10);
    const now      = new Date();

    await db.query(
      'INSERT INTO users (id, name, email, password, role, status, password_updated_at) VALUES (?,?,?,?,?,?,?)',
      [user_id, name, email, hash, userRole, 'active', now]
    );

    if (link_type === 'teacher') {
      await db.query('UPDATE teachers SET user_id=?, email=? WHERE id=?', [user_id, email, link_id]);
    } else if (link_type === 'student') {
      await db.query('UPDATE students SET user_id=?, email=? WHERE id=?', [user_id, email, link_id]);
    }

    res.json({ success: true, message: `Đã tạo tài khoản ${email}!` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Tài khoản đã tồn tại!' });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password — admin đặt lại mật khẩu
router.post('/reset-password', auth, role('admin'), async (req, res) => {
  try {
    const { user_id, new_password } = req.body;
    if (!user_id || !new_password) {
      return res.status(400).json({ message: 'Thiếu thông tin!' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự!' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password=?, password_updated_at=NOW() WHERE id=?',
      [hash, user_id]
    );
    res.json({ success: true, message: 'Đã đặt lại mật khẩu thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/auth/users — danh sách users (cho chat)
router.get('/users', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, role, phone FROM users WHERE id != ? AND status='active'",
      [req.user.id]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
// GET /api/auth/no-account?type=teacher|student — GV/HV chưa có tài khoản
router.get('/no-account', auth, role('admin'), async (req, res) => {
  try {
    const { type } = req.query;
    const table = type === 'teacher' ? 'teachers' : 'students';
    const [rows] = await db.query(
      `SELECT id, name FROM ${table} WHERE user_id IS NULL ORDER BY name ASC`
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
module.exports = router;