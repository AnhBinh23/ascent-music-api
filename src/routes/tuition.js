const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// GET /api/tuition — tất cả
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, s.name AS student_name, s.instrument,
             c.name AS class_name
      FROM tuition t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN classes  c ON t.class_id   = c.id
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/unpaid
router.get('/unpaid', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, s.name AS student_name
      FROM tuition t LEFT JOIN students s ON t.student_id = s.id
      WHERE t.status != 'Đã thanh toán'
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/stats — thống kê
router.get('/stats', auth, role('admin','staff'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='Đã thanh toán' THEN paid ELSE 0 END)    AS collected,
        SUM(CASE WHEN status!='Đã thanh toán' THEN amount-paid ELSE 0 END) AS remaining
      FROM tuition
    `);
    res.json({ success: true, ...rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/report — doanh thu theo từng tháng
router.get('/report', auth, role('admin','staff'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATE_FORMAT(created_at, '%m/%Y') AS month,
        SUM(amount)        AS revenue,
        SUM(paid)          AS collected,
        SUM(amount - paid) AS unpaid
      FROM tuition
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY YEAR(created_at), MONTH(created_at)
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/tuition — TẠO HÓA ĐƠN (có thể chưa thu)
router.post('/', auth, role('admin','staff'), async (req, res) => {
  try {
    const {
      student_id, class_id = null, month, amount,
      paid = 0, status = 'Chưa thanh toán',
      method = null, sessions = 0, note = null,
    } = req.body;

    if (!student_id || !amount) {
      return res.status(400).json({ message: 'Thiếu student_id hoặc amount!' });
    }

    const [result] = await db.query(
      `INSERT INTO tuition
       (student_id, class_id, month, amount, paid, status, method, sessions, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [student_id, class_id, month, Number(amount), Number(paid),
       status, method, Number(sessions), note]
    );

    res.json({ success: true, message: 'Tạo hóa đơn thành công!', id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/tuition/:id — CẬP NHẬT (thu tiền)
router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  try {
    const { paid, status, method, amount, note } = req.body;
    const fields = [];
    const values = [];

    if (paid    !== undefined) { fields.push('paid=?');      values.push(Number(paid)); }
    if (status  !== undefined) { fields.push('status=?');    values.push(status); }
    if (method  !== undefined) { fields.push('method=?');    values.push(method); }
    if (amount  !== undefined) { fields.push('amount=?');    values.push(Number(amount)); }
    if (note    !== undefined) { fields.push('note=?');      values.push(note); }

    if (status === 'Đã thanh toán' || paid > 0) {
      fields.push('paid_date=CURDATE()');
    }

    if (!fields.length) return res.status(400).json({ message: 'Không có dữ liệu cập nhật!' });

    values.push(req.params.id);
    await db.query(`UPDATE tuition SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ success: true, message: 'Cập nhật học phí thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/tuition/:id
router.delete('/:id', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM tuition WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa hóa đơn!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;