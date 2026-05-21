const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.*, s.name as student_name, s.phone as student_phone
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id
      ORDER BY i.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM invoices WHERE student_id = ? ORDER BY created_at DESC',
      [req.params.studentId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const {
      student_id, instrument, billing_type, sessions, sessions_per_week,
      price_per_session, duration, total_fee, discount, start_date, end_date,
      schedule, teacher_id, method, note
    } = req.body;

    const invoice_no = `HD${Date.now().toString().slice(-8)}`;
    await db.query(`
      INSERT INTO invoices
      (invoice_no,student_id,instrument,billing_type,sessions,sessions_per_week,
       price_per_session,duration,total_fee,discount,start_date,end_date,
       schedule,teacher_id,method,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invoice_no,student_id,instrument,billing_type,sessions,sessions_per_week,
       price_per_session,duration,total_fee,discount,start_date,end_date,
       schedule,teacher_id,method,note]
    );
    res.json({ success: true, message: 'Tạo hóa đơn thành công!', invoice_no });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { paid_method, paid_note } = req.body;
    await db.query(
      'UPDATE invoices SET status="paid", paid_date=CURDATE(), paid_method=?, paid_note=? WHERE id=?',
      [paid_method, paid_note, req.params.id]
    );
    res.json({ success: true, message: 'Xác nhận thanh toán thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStats = async (req, res) => {
  try {
    const [[unpaid]]   = await db.query('SELECT COUNT(*) as count FROM invoices WHERE status="unpaid"');
    const [[paid]]     = await db.query('SELECT COUNT(*) as count, SUM(total_fee) as total FROM invoices WHERE status="paid"');
    res.json({ success: true, unpaid: unpaid.count, paid: paid.count, total: paid.total || 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
};