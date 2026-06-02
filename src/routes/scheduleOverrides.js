const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../models/db');

// GET /api/schedule-overrides?start_date=&end_date=&teacher_id=
router.get('/', auth, async (req, res) => {
  try {
    const { start_date, end_date, teacher_id } = req.query;
    let query = `SELECT * FROM schedule_overrides WHERE 1=1`;
    const params = [];
    if (start_date) { query += ' AND original_date >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND original_date <= ?'; params.push(end_date); }
    if (teacher_id) { query += ' AND teacher_id = ?';     params.push(teacher_id); }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/schedule-overrides
router.post('/', auth, async (req, res) => {
  try {
    const {
      schedule_id, teacher_id, original_date,
      new_day_of_week, new_time_start, new_time_end,
      room_id, status, note
    } = req.body;
    await db.query(`
      INSERT INTO schedule_overrides
        (schedule_id, teacher_id, original_date, new_day_of_week, new_time_start, new_time_end, room_id, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        new_day_of_week = VALUES(new_day_of_week),
        new_time_start  = VALUES(new_time_start),
        new_time_end    = VALUES(new_time_end),
        teacher_id      = VALUES(teacher_id),
        room_id         = VALUES(room_id),
        status          = VALUES(status),
        note            = VALUES(note)
    `, [schedule_id, teacher_id||null, original_date, new_day_of_week||null,
        new_time_start, new_time_end, room_id||null, status||'rescheduled', note||null]);
    res.json({ success: true, message: 'Đã lưu lịch ngoại lệ!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/schedule-overrides/:scheduleId/:date
router.delete('/:scheduleId/:date', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM schedule_overrides WHERE schedule_id = ? AND original_date = ?',
      [req.params.scheduleId, req.params.date]
    );
    res.json({ success: true, message: 'Đã về lịch bình thường!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;