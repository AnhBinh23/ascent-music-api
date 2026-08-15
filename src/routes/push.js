const router  = require('express').Router();
const webpush = require('web-push');
const auth    = require('../middleware/auth');
const db      = require('../models/db');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ─── Lưu subscription ───
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.id;
    await db.query(
      `INSERT INTO push_subscriptions (user_id, subscription)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE subscription = ?`,
      [userId, JSON.stringify(subscription), JSON.stringify(subscription)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Gửi push tới danh sách user (broadcast) ───
router.post('/send', auth, async (req, res) => {
  try {
    const { title, body, userIds } = req.body;
    let query  = 'SELECT * FROM push_subscriptions';
    let params = [];
    if (userIds?.length) { query += ' WHERE user_id IN (?)'; params = [userIds]; }
    const [subs] = await db.query(query, params);
    const payload = JSON.stringify({ title, body });
    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(JSON.parse(sub.subscription), payload))
    );
    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    res.json({ success: true, sent, failed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Helper: gửi push tới 1 user ───
async function sendPushToUser(toUserId, payload) {
  try {
    const [rows] = await db.query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = ?',
      [toUserId]
    );
    if (!rows.length) return false;
    await webpush.sendNotification(
      JSON.parse(rows[0].subscription),
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    if (err.statusCode === 410) {
      await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [toUserId]);
    }
    return false;
  }
}

// ─── Nhắc lịch học trước 30 phút (gọi bởi cron) ───
async function remindUpcomingClasses() {
  const vnNow  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const target = new Date(vnNow.getTime() + 30 * 60 * 1000);

  const hh  = String(target.getHours()).padStart(2, '0');
  const mm  = String(target.getMinutes()).padStart(2, '0');
  const timeHHMM = `${hh}:${mm}`;
  const dow = target.getDay() === 0 ? 1 : target.getDay() + 1;

  // Lấy tất cả buổi học khớp thứ + giờ
  const [rows] = await db.query(`
    SELECT
      sc.id,
      sc.time_start,
      c.name      AS class_name,
      c.id        AS class_id,
      r.name      AS room_name,
      t.user_id   AS teacher_user_id
    FROM schedules sc
    JOIN classes c    ON sc.class_id  = c.id
    JOIN teachers t   ON sc.teacher_id = t.id
    LEFT JOIN rooms r ON sc.room_id   = r.id
    WHERE sc.day_of_week = ?
      AND TIME_FORMAT(sc.time_start, '%H:%i') = ?
      AND sc.status = 'active'
  `, [dow, timeHHMM]);

  if (!rows.length) return 0;

  let sent = 0;

  for (const row of rows) {
    const timeStr = String(row.time_start).slice(0, 5);
    const room    = row.room_name || 'Ascent Music Center';

    // 1. Nhắc giáo viên
    if (row.teacher_user_id) {
      const ok = await sendPushToUser(row.teacher_user_id, {
        title: '📋 Nhắc lịch dạy',
        body:  `Bạn có buổi dạy ${row.class_name} lúc ${timeStr} tại ${room}`,
        url:   '/teacher/schedule',
      });
      if (ok) sent++;
    }

    // 2. Nhắc học viên có tài khoản app
    const [students] = await db.query(`
      SELECT st.user_id
      FROM class_students cs
      JOIN students st ON st.id = cs.student_id
      WHERE cs.class_id = ?
        AND st.user_id IS NOT NULL
        AND st.status IN ('active', 'paused')
    `, [row.class_id]);

    for (const stu of students) {
      const ok = await sendPushToUser(stu.user_id, {
        title: '🎵 Nhắc lịch học Ascent Music',
        body:  `Bạn có buổi học ${row.class_name} lúc ${timeStr} tại ${room}`,
        url:   '/student/schedule',
      });
      if (ok) sent++;
    }
  }

  return sent;
}

async function checkCourseEnding() {
  const THRESHOLD = 3;
  const [rows] = await db.query(`
    SELECT
      s.id AS student_id, s.name AS student_name, s.nickname,
      s.total_sessions, s.current_course, s.instrument,
      c.id AS class_id, c.name AS class_name,
      t.id AS teacher_id, t.user_id AS teacher_user_id, t.name AS teacher_name,
      COUNT(CASE WHEN a.status IN ('present','late') AND a.course_number = s.current_course THEN 1 END) AS attended
    FROM students s
    INNER JOIN class_students cs ON cs.student_id = s.id
    INNER JOIN classes c ON c.id = cs.class_id
    INNER JOIN teachers t ON t.id = c.teacher_id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.class_id = c.id
    WHERE s.status = 'active' AND c.status = 'Đang học' AND s.total_sessions > 0
    GROUP BY s.id, s.name, s.nickname, s.total_sessions, s.current_course, s.instrument,
             c.id, c.name, t.id, t.user_id, t.name
    HAVING (s.total_sessions - attended) <= ? AND (s.total_sessions - attended) >= 0
  `, [THRESHOLD]);

  let sent = 0;
  for (const row of rows) {
    const remaining = row.total_sessions - row.attended;
    if (!row.teacher_user_id) continue;

    const key = `${row.student_id}_${row.class_id}_${row.current_course}`;
    const [already] = await db.query(
      `SELECT id FROM notifications WHERE type = 'course_ending' AND message LIKE ? AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [`%${key}%`]
    );
    if (already.length) continue;

    const displayName = row.nickname ? `${row.student_name} (${row.nickname})` : row.student_name;
    const title = `HV ${displayName} sắp hết khóa`;
    const body = `Còn ${remaining} buổi — Lớp ${row.class_name}. Hãy chuẩn bị kiểm tra cuối khóa.`;

    const ok = await sendPushToUser(row.teacher_user_id, { title, body, url: '/teacher/classes' });
    if (ok) sent++;

    await db.query(
      `INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)`,
      [title, `${body} [key:${key}]`, 'course_ending', 'specific', 'system']
    );
  }
  return sent;
}

router.post('/remind-schedule', async (req, res) => {
  try {
    const sent = await remindUpcomingClasses();
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/check-course-ending', async (req, res) => {
  try {
    const sent = await checkCourseEnding();
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, sendPushToUser, remindUpcomingClasses, checkCourseEnding };