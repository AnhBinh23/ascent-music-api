const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');
const v      = require('../middleware/validate');
const { trialLimiter } = require('../middleware/rateLimiter');

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT tr.*, t.name AS teacher_name, r.name AS room_name
      FROM trial_registrations tr
      LEFT JOIN teachers t ON tr.teacher_id = t.id
      LEFT JOIN rooms r ON tr.room_id = r.id
      ORDER BY tr.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/by-teacher', auth, async (req, res) => {
  try {
    const { teacher_id, date } = req.query;
    let sql = `
      SELECT tr.*, r.name AS room_name
      FROM trial_registrations tr
      LEFT JOIN rooms r ON tr.room_id = r.id
      WHERE tr.teacher_id = ? AND tr.status IN ('pending','contacted')
    `;
    const params = [teacher_id];
    if (date) { sql += ' AND tr.trial_date = ?'; params.push(date); }
    sql += ' ORDER BY tr.trial_date ASC, tr.time_start ASC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/schedule', auth, async (req, res) => {
  try {
    const { start_date, end_date, teacher_id } = req.query;
    let sql = `
      SELECT tr.*, t.name AS teacher_name, r.name AS room_name
      FROM trial_registrations tr
      LEFT JOIN teachers t ON tr.teacher_id = t.id
      LEFT JOIN rooms r ON tr.room_id = r.id
      WHERE tr.trial_date IS NOT NULL AND tr.status IN ('pending','contacted')
    `;
    const params = [];
    if (start_date && end_date) { sql += ' AND tr.trial_date BETWEEN ? AND ?'; params.push(start_date, end_date); }
    if (teacher_id) { sql += ' AND tr.teacher_id = ?'; params.push(teacher_id); }
    sql += ' ORDER BY tr.trial_date ASC, tr.time_start ASC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', trialLimiter, v.trial.create, async (req, res) => {
  try {
    const { name, phone, instrument, time, age, note } = req.body;
    await db.query(
      'INSERT INTO trial_registrations (name, phone, instrument, time, age, note) VALUES (?,?,?,?,?,?)',
      [name, phone, instrument, time, age, note]
    );
    res.json({ success: true, message: 'Đăng ký thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', auth, role('admin', 'staff'), async (req, res) => {
  try {
    const { status, teacher_id, trial_date, time_start, time_end, room_id, note } = req.body;
    const fields = [];
    const params = [];
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (teacher_id !== undefined) { fields.push('teacher_id = ?'); params.push(teacher_id); }
    if (trial_date !== undefined) { fields.push('trial_date = ?'); params.push(trial_date); }
    if (time_start !== undefined) { fields.push('time_start = ?'); params.push(time_start); }
    if (time_end !== undefined) { fields.push('time_end = ?'); params.push(time_end); }
    if (room_id !== undefined) { fields.push('room_id = ?'); params.push(room_id); }
    if (note !== undefined) { fields.push('note = ?'); params.push(note); }
    if (!fields.length) return res.status(400).json({ message: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    await db.query(`UPDATE trial_registrations SET ${fields.join(', ')} WHERE id = ?`, params);

    if (teacher_id && trial_date) {
      const [[teacher]] = await db.query('SELECT user_id, name FROM teachers WHERE id = ?', [teacher_id]);
      if (teacher?.user_id) {
        const [[trial]] = await db.query('SELECT name, instrument FROM trial_registrations WHERE id = ?', [req.params.id]);
        await db.query(
          'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
          [
            `🧪 HV học thử: ${trial?.name}`,
            `Ngày ${trial_date} · ${time_start?.slice(0,5) || ''}-${time_end?.slice(0,5) || ''} · ${trial?.instrument || ''}`,
            'general',
            `teacher:${teacher.user_id}`,
            'system'
          ]
        );
      }
    }

    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM trial_registrations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;