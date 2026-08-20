const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// ─── GET /api/flexible-sessions ───────────────────────────────────────────────
// Lấy danh sách buổi linh hoạt (admin/staff xem tất cả, student xem của mình)
router.get('/', auth, async (req, res) => {
  try {
    const { class_id, student_id, date, status } = req.query;
    let sql = `
      SELECT fs.*,
        s.name AS student_name, s.nickname, s.phone AS student_phone,
        c.name AS class_name, c.instrument, c.teacher_id,
        t.name AS teacher_name,
        r.name AS room_name,
        sc.time_start, sc.time_end, sc.day_of_week
      FROM flexible_sessions fs
      LEFT JOIN students  s  ON fs.student_id  = s.id
      LEFT JOIN classes   c  ON fs.class_id    = c.id
      LEFT JOIN teachers  t  ON t.id           = c.teacher_id
      LEFT JOIN rooms     r  ON fs.room_id     = r.id
      LEFT JOIN schedules sc ON sc.class_id    = fs.class_id
        AND sc.day_of_week = DAYOFWEEK(fs.session_date)
      WHERE 1=1
    `;
    const params = [];
    if (class_id)   { sql += ' AND fs.class_id = ?';    params.push(class_id); }
    if (student_id) { sql += ' AND fs.student_id = ?';  params.push(student_id); }
    if (date)       { sql += ' AND fs.session_date = ?'; params.push(date); }
    if (status)     { sql += ' AND fs.status = ?';      params.push(status); }
    sql += ' ORDER BY fs.session_date DESC, s.name ASC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/flexible-sessions/available-slots/:classId ──────────────────────
// Lấy các buổi còn slot trống của 1 lớp linh hoạt (HV dùng để đăng ký)
router.get('/available-slots/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { from, to } = req.query;

    // Kiểm tra lớp có phải flexible không
    const [[cls]] = await db.query(
      'SELECT id, name, max_students, instrument, is_flexible FROM classes WHERE id = ? AND is_flexible = 1',
      [classId]
    );
    if (!cls) return res.status(404).json({ message: 'Lớp linh hoạt không tồn tại!' });

    // Lấy lịch học của lớp (các thứ trong tuần)
    const [schedules] = await db.query(
      'SELECT day_of_week, time_start, time_end, room_id FROM schedules WHERE class_id = ? AND status = "active"',
      [classId]
    );

    // Tạo danh sách ngày học từ from → to
    const fromDate = from ? new Date(from) : new Date();
    const toDate   = to   ? new Date(to)   : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const slots    = [];

    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay() === 0 ? 1 : d.getDay() + 1; // convert về DB format (1=CN,2=T2...)
      const sch = schedules.find(s => s.day_of_week === dow);
      if (!sch) continue;

      const dateStr = d.toISOString().split('T')[0];

      // Đếm số HV đã đăng ký buổi này
      const [[booked]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM flexible_sessions
         WHERE class_id = ? AND session_date = ? AND status != 'cancelled'`,
        [classId, dateStr]
      );

      slots.push({
        date:        dateStr,
        day_of_week: sch.day_of_week,
        time_start:  sch.time_start,
        time_end:    sch.time_end,
        room_id:     sch.room_id,
        booked:      booked.cnt,
        max:         cls.max_students,
        available:   booked.cnt < cls.max_students,
      });
    }

    res.json({ success: true, slots, class: cls });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/flexible-sessions ──────────────────────────────────────────────
// HV đăng ký 1 buổi linh hoạt
router.post('/', auth, async (req, res) => {
  try {
    const { student_id, class_id, session_date, note } = req.body;
    if (!student_id || !class_id || !session_date) {
      return res.status(400).json({ message: 'Thiếu student_id, class_id hoặc session_date!' });
    }

    // Kiểm tra lớp có phải flexible
    const [[cls]] = await db.query(
      'SELECT id, max_students, name, is_flexible FROM classes WHERE id = ? AND is_flexible = 1',
      [class_id]
    );
    if (!cls) return res.status(400).json({ message: 'Lớp này không phải lớp linh hoạt!' });

    // Kiểm tra HV đã đăng ký buổi này chưa
    const [existing] = await db.query(
      'SELECT id, status FROM flexible_sessions WHERE student_id = ? AND class_id = ? AND session_date = ?',
      [student_id, class_id, session_date]
    );
    if (existing.length && existing[0].status !== 'cancelled') {
      return res.status(409).json({ message: 'Học viên đã đăng ký buổi này rồi!' });
    }

    // Kiểm tra còn slot không
    const [[booked]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM flexible_sessions
       WHERE class_id = ? AND session_date = ? AND status != 'cancelled'`,
      [class_id, session_date]
    );
    if (booked.cnt >= cls.max_students) {
      return res.status(400).json({ message: 'Buổi này đã đủ học viên!' });
    }

    if (existing.length && existing[0].status === 'cancelled') {
      // Re-activate
      await db.query(
        'UPDATE flexible_sessions SET status = "registered", note = ? WHERE id = ?',
        [note || '', existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO flexible_sessions (student_id, class_id, session_date, note, status)
         VALUES (?,?,?,?,'registered')`,
        [student_id, class_id, session_date, note || '']
      );
    }

    res.json({ success: true, message: `Đã đăng ký buổi học ${session_date} tại ${cls.name}!` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/flexible-sessions/:id/cancel ──────────────────────────────────
// HV huỷ đăng ký
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM flexible_sessions WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy!' });

    // Kiểm tra: chỉ huỷ được nếu > 2 tiếng trước buổi học
    const session = rows[0];
    const sessionDateTime = new Date(`${session.session_date}T${session.time_start || '00:00'}`);
    const now = new Date();
    const diffHours = (sessionDateTime - now) / 3600000;
    if (diffHours < 2 && req.user.role === 'student') {
      return res.status(400).json({ message: 'Chỉ được huỷ trước buổi học ít nhất 2 tiếng!' });
    }

    await db.query(
      'UPDATE flexible_sessions SET status = "cancelled" WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, message: 'Đã huỷ đăng ký!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/flexible-sessions/:id/checkin ─────────────────────────────────
// Điểm danh HV linh hoạt (teacher/admin/staff)
router.patch('/:id/checkin', auth, role('admin', 'staff', 'teacher'), async (req, res) => {
  try {
    const { status = 'present', note = '' } = req.body;
    const [rows] = await db.query('SELECT * FROM flexible_sessions WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy!' });
    const fs = rows[0];

    await db.query(
      'UPDATE flexible_sessions SET status = ?, attendance_note = ?, attended_at = NOW() WHERE id = ?',
      [status === 'absent' ? 'absent' : 'attended', note, req.params.id]
    );

    // Ghi vào bảng attendance (is_guest=1, home_class_id = null vì HV này không có lớp cố định)
    await db.query(`
      INSERT INTO attendance (class_id, student_id, date, status, note, is_guest, course_number)
      VALUES (?,?,?,?,?,1,1)
      ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note)
    `, [fs.class_id, fs.student_id, fs.session_date, status, note]);

    // Tính lương giáo viên theo số HV thực tế có mặt
    const [[cls]] = await db.query('SELECT teacher_id, max_students, name FROM classes WHERE id = ?', [fs.class_id]);

    const [[presentRow]] = await db.query(`
      SELECT COUNT(*) AS present FROM attendance
      WHERE class_id = ? AND date = ? AND status IN ('present','late')
    `, [fs.class_id, fs.session_date]);
    const presentCount = presentRow.present;

    // Tổng HV đăng ký buổi đó (không phải max_students)
    const [[totalRow]] = await db.query(`
      SELECT COUNT(*) AS total FROM flexible_sessions
      WHERE class_id = ? AND session_date = ? AND status != 'cancelled'
    `, [fs.class_id, fs.session_date]);
    const totalCount = totalRow.total;

    const [rates] = await db.query(
      'SELECT amount FROM group_salary_rates WHERE class_id = ? AND present_count = ? AND total_count = ?',
      [fs.class_id, presentCount, totalCount]
    );
    const amount = rates.length ? rates[0].amount : 0;

    const noteText = `${cls.name} (linh hoạt): ${presentCount}/${totalCount} HV có mặt`;
    await db.query(`
      INSERT INTO pending_salary (teacher_id, class_id, date, present_count, total_count, amount, note)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE present_count=VALUES(present_count), total_count=VALUES(total_count),
        amount=VALUES(amount), note=VALUES(note), status='pending'
    `, [cls.teacher_id, fs.class_id, fs.session_date, presentCount, totalCount, amount, noteText]);

    res.json({ success: true, message: 'Đã điểm danh!', present_count: presentCount, total_count: totalCount, salary: amount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/flexible-sessions/by-class/:classId/date/:date ──────────────────
// Lấy danh sách HV đã đăng ký 1 buổi cụ thể (dùng để điểm danh)
router.get('/by-class/:classId/date/:date', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT fs.*, s.name AS student_name, s.nickname, s.phone
      FROM flexible_sessions fs
      LEFT JOIN students s ON fs.student_id = s.id
      WHERE fs.class_id = ? AND fs.session_date = ? AND fs.status != 'cancelled'
      ORDER BY s.name ASC
    `, [req.params.classId, req.params.date]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/merged', auth, async (req, res) => {
  try {
    const { teacher_id, date, class_id } = req.query;
    if (!teacher_id || !date || !class_id) return res.json({ success: true, rows: [] });

    const [[currentSchedule]] = await db.query(
      `SELECT time_start, time_end FROM schedules
       WHERE class_id = ? AND day_of_week = DAYOFWEEK(?) AND status = 'active' LIMIT 1`,
      [class_id, date]
    );
    if (!currentSchedule) return res.json({ success: true, rows: [] });

    const [rows] = await db.query(`
      SELECT fs.id, fs.student_id, fs.session_date, fs.status, fs.class_id AS flex_class_id,
        s.name AS student_name, s.nickname,
        c.name AS flex_class_name,
        sc.time_start AS flex_time_start, sc.time_end AS flex_time_end
      FROM flexible_sessions fs
      LEFT JOIN students s ON fs.student_id = s.id
      LEFT JOIN classes c ON fs.class_id = c.id
      LEFT JOIN schedules sc ON sc.class_id = c.id
        AND sc.day_of_week = DAYOFWEEK(fs.session_date) AND sc.status = 'active'
      WHERE c.teacher_id = ?
        AND fs.session_date = ?
        AND fs.status = 'registered'
        AND fs.class_id != ?
        AND sc.time_start = ?
        AND sc.time_end = ?
    `, [teacher_id, date, class_id, currentSchedule.time_start, currentSchedule.time_end]);

    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;