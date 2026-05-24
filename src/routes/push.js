const router   = require('express').Router();
const webpush  = require('web-push');
const auth     = require('../middleware/auth');
const db       = require('../models/db');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Lưu subscription
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

// Gửi push notification
router.post('/send', auth, async (req, res) => {
  try {
    const { title, body, userIds } = req.body;

    let query = 'SELECT * FROM push_subscriptions';
    let params = [];

    if (userIds?.length) {
      query += ' WHERE user_id IN (?)';
      params = [userIds];
    }

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

// Gửi nhắc lịch học tự động (gọi mỗi 30 phút)
router.post('/remind-schedule', async (req, res) => {
  try {
    const now    = new Date();
    const target = new Date(now.getTime() + 30 * 60 * 1000);

    const hh = target.getHours().toString().padStart(2, '0');
    const mm = target.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    const dateStr = target.toISOString().split('T')[0];

    // Tìm lịch học sau 30 phút
    const [schedules] = await db.query(`
      SELECT s.*, c.name as class_name, c.student_id,
             u.name as teacher_name, r.name as room_name
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      LEFT JOIN users u ON c.teacher_id = u.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE s.date = ? AND s.time_start = ?
    `, [dateStr, timeStr]);

    let sent = 0;
    for (const schedule of schedules) {
      // Lấy subscription của học viên
      const [subs] = await db.query(
        'SELECT * FROM push_subscriptions WHERE user_id = ?',
        [schedule.student_id]
      );

      const payload = JSON.stringify({
        title: '🎵 Nhắc lịch học Ascent Music',
        body:  `Bạn có buổi học ${schedule.class_name} lúc ${schedule.time_start} hôm nay tại ${schedule.room_name || 'Ascent Music Center'}`,
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(JSON.parse(sub.subscription), payload);
          sent++;
        } catch (e) {
          // Xóa subscription hết hạn
          if (e.statusCode === 410) {
            await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
          }
        }
      }
    }

    res.json({ success: true, sent, schedules: schedules.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;