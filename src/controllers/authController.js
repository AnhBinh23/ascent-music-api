const db     = require('../models/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('📧 Login:', email);

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ?", [email]
    );
    console.log('👤 Tìm thấy:', rows.length, 'user');

    if (!rows.length) return res.status(401).json({ message: 'Email không tồn tại' });

    const user = rows[0];
    console.log('🔒 Status:', user.status);

    if (user.status !== 'active') return res.status(401).json({ message: 'Tài khoản đã bị khóa' });

    const valid = await bcrypt.compare(password, user.password);
    console.log('✅ Password hợp lệ:', valid);

    if (!valid) return res.status(401).json({ message: 'Mật khẩu không đúng' });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    const { password: _, ...userInfo } = user;
    res.json({ success: true, token, user: userInfo });
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, role, instrument, note } = req.body;
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ message: 'Email đã tồn tại' });

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO pending_accounts (name, email, phone, role, instrument, password, note) VALUES (?,?,?,?,?,?,?)',
      [name, email, phone, role, instrument, hashed, note]
    );
    res.json({ success: true, message: 'Đăng ký thành công! Chờ Admin xét duyệt.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, status FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const valid  = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};