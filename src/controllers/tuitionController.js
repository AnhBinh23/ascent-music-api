const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, s.name AS student_name, s.instrument
      FROM tuition t
      LEFT JOIN students s ON t.student_id = s.id
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM tuition WHERE student_id = ? ORDER BY month DESC',
      [req.params.studentId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStats = async (req, res) => {
  try {
    const [[paid]]   = await db.query(`SELECT COUNT(*) as count, SUM(paid) as total FROM tuition WHERE status = 'Đã thanh toán'`);
    const [[unpaid]] = await db.query(`SELECT COUNT(*) as count FROM tuition WHERE status = 'Chưa thanh toán'`);
    const [[partial]] = await db.query(`SELECT COUNT(*) as count FROM tuition WHERE status = 'Thanh toán 1 phần'`);
    res.json({
      success: true,
      paid:    paid.count,
      unpaid:  unpaid.count,
      partial: partial.count,
      total:   paid.total || 0,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getRevenueByMonth = async (req, res) => {
  try {
    const { year } = req.query;
    const [rows] = await db.query(`
      SELECT
        SUBSTRING(month, 1, 2) AS month_num,
        SUM(paid)              AS total,
        COUNT(*)               AS count
      FROM tuition
      WHERE status = 'Đã thanh toán'
        AND SUBSTRING(month, 4, 4) = ?
      GROUP BY month_num
      ORDER BY month_num ASC
    `, [year || new Date().getFullYear()]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { student_id, month, amount, method, note } = req.body;
    await db.query(
      `INSERT INTO tuition (student_id, month, amount, paid, status, method, note, paid_date)
       VALUES (?, ?, ?, ?, 'Đã thanh toán', ?, ?, CURDATE())`,
      [student_id, month, amount, amount, method, note]
    );
    res.json({ success: true, message: 'Thu học phí thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { paid, status, method } = req.body;
    await db.query(
      'UPDATE tuition SET paid=?, status=?, method=?, paid_date=CURDATE() WHERE id=?',
      [paid, status, method, req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật học phí thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM tuition WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};