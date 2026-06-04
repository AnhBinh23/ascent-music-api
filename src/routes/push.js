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

    if (userIds?.length) {
      query  += ' WHERE user_id IN (?)';
      params  = [userIds];
    }

    const [subs] = await db.query(query, params);

    const payload = JSON.stringify({ title, body });
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(JSON.parse(sub.subscription), payload)
      )
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
      // Subscription hết hạn → xóa
      await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [toUserId]);
    }
    return false;
  }
}

// ─── Nhắc lịch học trước 30 phút (gọi bởi cron) ───
// An toàn timezone: luôn tính theo giờ Việt Nam, không phụ thuộc TZ của server.
async function remindUpcomingClasses() {
  // Giờ hiện tại theo Việt Nam
  const vnNow  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const target = new Date(vnNow.getTime() + 30 * 60 * 1000); // 30 phút sau

  const hh  = String(target.getHours()).padStart(2, '0');
  const mm  = String(target.getMinutes()).padStart(2, '0');
  const timeHHMM = `${hh}:${mm}`;
  // day_of_week theo convention DB: 1=CN, 2=T2 .. 7=T7
  const dow = target.getDay() === 0 ? 1 : target.getDay() + 1;

  // Lấy các buổi học định kỳ khớp thứ + giờ, kèm user_id của học viên
  const [rows] = await db.query(`
    SELECT sc.id, sc.time_start,
           c.name  AS class_name,
           r.name  AS room_name,
           st.user_id AS student_user_id
    FROM schedules sc
    JOIN classes c        ON sc.class_id = c.id
    JOIN class_students cs ON cs.class_id = c.id
    JOIN students st       ON st.id = cs.student_id
    LEFT JOIN rooms r      ON sc.room_id = r.id
    WHERE sc.day_of_week = ?
      AND TIME_FORMAT(sc.time_start, '%H:%i') = ?
      AND sc.status = 'active'
      AND st.status = 'active'
  `, [dow, timeHHMM]);

  let sent = 0;
  for (const row of rows) {
    if (!row.student_user_id) continue;
    const ok = await sendPushToUser(row.student_user_id, {
      title: '🎵 Nhắc lịch học Ascent Music',
      body:  `Bạn có buổi học ${row.class_name} lúc ${String(row.time_start).slice(0, 5)} tại ${row.room_name || 'Ascent Music Center'}`,
      url:   '/student/schedule',
    });
    if (ok) sent++;
  }
  return sent;
}

// ─── Route HTTP để test thủ công ───
router.post('/remind-schedule', async (req, res) => {
  try {
    const sent = await remindUpcomingClasses();
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, sendPushToUser, remindUpcomingClasses };