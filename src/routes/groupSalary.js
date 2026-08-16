const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/rates/:classId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM group_salary_rates WHERE class_id = ? ORDER BY present_count ASC',
      [req.params.classId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/rates/:classId', auth, role('admin', 'staff'), async (req, res) => {
  try {
    const { rates } = req.body;
    const classId = req.params.classId;
    await db.query('DELETE FROM group_salary_rates WHERE class_id = ?', [classId]);
    for (const r of rates) {
      await db.query(
        'INSERT INTO group_salary_rates (class_id, present_count, total_count, amount) VALUES (?,?,?,?)',
        [classId, r.present_count, r.total_count, r.amount || 0]
      );
    }
    res.json({ success: true, message: 'Đã lưu bảng lương nhóm!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/pending', auth, async (req, res) => {
  try {
    const { status, teacher_id } = req.query;
    let sql = `
      SELECT ps.*, c.name AS class_name, t.name AS teacher_name
      FROM pending_salary ps
      LEFT JOIN classes c ON ps.class_id = c.id
      LEFT JOIN teachers t ON ps.teacher_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND ps.status = ?'; params.push(status); }
    if (teacher_id) { sql += ' AND ps.teacher_id = ?'; params.push(teacher_id); }
    sql += ' ORDER BY ps.date DESC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pending/:id/confirm', auth, role('admin', 'staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM pending_salary WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy!' });
    const ps = rows[0];
    await db.query(
      'UPDATE pending_salary SET status = ?, confirmed_by = ?, confirmed_at = NOW() WHERE id = ?',
      ['confirmed', req.user.id, id]
    );
    const month = ps.date.toISOString().slice(0, 7);
    const [existing] = await db.query(
      'SELECT * FROM salary_payments WHERE teacher_id = ? AND month = ?',
      [ps.teacher_id, month]
    );
    if (existing.length) {
      await db.query(
        'UPDATE salary_payments SET amount = amount + ? WHERE teacher_id = ? AND month = ?',
        [ps.amount, ps.teacher_id, month]
      );
    } else {
      await db.query(
        'INSERT INTO salary_payments (teacher_id, month, amount, status, note) VALUES (?,?,?,?,?)',
        [ps.teacher_id, month, ps.amount, 'paid', `Lương nhóm ${ps.date.toISOString().slice(0,10)}`]
      );
    }
    res.json({ success: true, message: 'Đã xác nhận và tính vào lương!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pending/:id/reject', auth, role('admin', 'staff'), async (req, res) => {
  try {
    await db.query(
      'UPDATE pending_salary SET status = ?, confirmed_by = ?, confirmed_at = NOW() WHERE id = ?',
      ['rejected', req.user.id, req.params.id]
    );
    res.json({ success: true, message: 'Đã từ chối!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;