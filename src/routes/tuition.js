const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// GET /api/tuition
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, s.name AS student_name, c.name AS class_name, s.instrument
      FROM tuition t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN classes  c ON t.class_id   = c.id
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [[row]] = await db.query(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(paid), 0) AS collected,
        COALESCE(SUM(amount - paid), 0) AS remaining
      FROM tuition
    `);
    res.json({ success: true, ...row });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/renewal-prediction — Dự đoán tái khóa
router.get('/renewal-prediction', auth, role('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.id, s.name, s.nickname, s.instrument, s.status,
        s.total_sessions, s.current_course,
        COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS all_present,
        COUNT(a.id) AS all_total,
        COUNT(CASE WHEN a.course_number = s.current_course AND a.status IN ('present','late') THEN 1 END) AS cur_present,
        COUNT(CASE WHEN a.course_number = s.current_course THEN 1 END) AS cur_total,
        COUNT(CASE WHEN a.course_number < s.current_course AND a.status IN ('present','late') THEN 1 END) AS prev_present,
        COUNT(CASE WHEN a.course_number < s.current_course THEN 1 END) AS prev_total,
        c.name AS class_name, c.type AS class_type, c.tuition_fee,
        t.name AS teacher_name,
        (SELECT tu.amount FROM tuition tu WHERE tu.student_id = s.id ORDER BY tu.course_number DESC, tu.created_at DESC LIMIT 1) AS last_tuition_amount
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id
      LEFT JOIN class_students cs ON cs.student_id = s.id
      LEFT JOIN classes c ON c.id = cs.class_id
      LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE s.status IN ('active','paused')
      GROUP BY s.id, s.name, s.nickname, s.instrument, s.status,
               s.total_sessions, s.current_course,
               c.name, c.type, c.tuition_fee, t.name
      ORDER BY (s.total_sessions - COUNT(CASE WHEN a.course_number = s.current_course AND a.status IN ('present','late') THEN 1 END)) ASC, s.name ASC
    `);

    const [notes] = await db.query('SELECT * FROM renewal_notes');
    const noteMap = {};
    notes.forEach(n => { noteMap[n.student_id] = n; });

    const predictions = rows.map(r => {
      const allRate  = r.all_total > 0 ? Math.round(r.all_present / r.all_total * 100) : 0;
      const curRate  = r.cur_total > 0 ? Math.round(r.cur_present / r.cur_total * 100) : 0;
      const prevRate = r.prev_total > 0 ? Math.round(r.prev_present / r.prev_total * 100) : 0;
      const trend    = r.prev_total > 0 ? curRate - prevRate : 0;
      const hasRenewed = r.current_course > 1;
      const remaining  = Math.max(0, (Number(r.total_sessions)||0) - (Number(r.cur_present)||0));
      const isPaused   = r.status === 'paused';

      let score;
      if (isPaused) score = 20;
      else if (allRate >= 80 && (trend >= 0 || hasRenewed)) score = 90;
      else if (allRate >= 80) score = 75;
      else if (allRate >= 60 && hasRenewed) score = 65;
      else if (allRate >= 60) score = 55;
      else score = 30;

      if (hasRenewed && r.current_course >= 3) score = Math.min(score + 10, 95);
      if (trend > 10) score = Math.min(score + 5, 95);
      if (trend < -15) score = Math.max(score - 10, 10);

      const level = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
      const rn = noteMap[r.id] || {};
      return {
        id: r.id, name: r.name, nickname: r.nickname, instrument: r.instrument,
        status: r.status, class_name: r.class_name, class_type: r.class_type,
        teacher_name: r.teacher_name, current_course: r.current_course,
        total_sessions: r.total_sessions, remaining,
        tuition_fee: Number(r.last_tuition_amount) || Number(r.tuition_fee) || 0,
        all_rate: allRate, cur_rate: curRate, prev_rate: prevRate, trend,
        has_renewed: hasRenewed, level, score,
        confirmed: !!rn.confirmed, note: rn.note || '',
      };
    });

    const high = predictions.filter(p => p.level === 'high');
    const med  = predictions.filter(p => p.level === 'medium');
    res.json({
      success: true, predictions,
      summary: {
        total: predictions.length,
        high: high.length, medium: med.length,
        low: predictions.filter(p => p.level === 'low').length,
        near_end: predictions.filter(p => p.remaining <= 5).length,
        confirmed: predictions.filter(p => p.confirmed).length,
        revenue_high: high.reduce((s,p) => s+p.tuition_fee, 0),
        revenue_medium: med.reduce((s,p) => s+p.tuition_fee, 0),
        revenue_all: predictions.reduce((s,p) => s+p.tuition_fee, 0),
        revenue_confirmed: predictions.filter(p=>p.confirmed).reduce((s,p) => s+p.tuition_fee, 0),
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/tuition/renewal-note — lưu ghi chú + xác nhận tái khóa
router.post('/renewal-note', auth, role('admin'), async (req, res) => {
  try {
    const { student_id, confirmed, note } = req.body;
    await db.query(
      `INSERT INTO renewal_notes (student_id, confirmed, note) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE confirmed=VALUES(confirmed), note=VALUES(note)`,
      [student_id, confirmed ? 1 : 0, note || '']
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tuition/:id — phải nằm SAU các route cụ thể
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT t.*, s.name AS student_name, c.name AS class_name
      FROM tuition t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN classes  c ON t.class_id   = c.id
      WHERE t.id = ?
    `, [req.params.id]);
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/tuition
router.post('/', auth, role('admin','staff'), async (req, res) => {
  try {
    const { student_id, class_id, amount, paid, status, sessions, month, method, note, course_number } = req.body;
    await db.query(
      `INSERT INTO tuition (student_id, class_id, amount, paid, status, sessions, month, method, note, course_number)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [student_id, class_id, amount||0, paid||0, status||'Chưa thanh toán', sessions||0, month||null, method||null, note||null, course_number||1]
    );
    res.json({ success: true, message: 'Thêm học phí thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/tuition/:id
router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  try {
    const { amount, paid, status, sessions, month, method, note, paid_date } = req.body;
    await db.query(
      `UPDATE tuition SET amount=?, paid=?, status=?, sessions=?, month=?, method=?, note=?, paid_date=? WHERE id=?`,
      [amount, paid, status, sessions||null, month||null, method||null, note||null, paid_date||null, req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/tuition/:id
router.delete('/:id', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM tuition WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;