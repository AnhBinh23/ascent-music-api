const router             = require('express').Router();
const auth               = require('../middleware/auth');
const db                 = require('../models/db');
const { sendPushToUser } = require('./push');
const v                  = require('../middleware/validate');

// ─── Lấy số tin nhắn chưa đọc ────────────────────────────────────────────────
router.get('/unread-count', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT COUNT(*) as count FROM messages WHERE to_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ success: true, count: rows[0].count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Lấy tin nhắn giữa 2 người + đánh dấu đã đọc ────────────────────────────
router.get('/:contactId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT m.*, u.name AS from_name
      FROM messages m
      LEFT JOIN users u ON m.from_id = u.id
      WHERE (m.from_id = ? AND m.to_id = ?)
         OR (m.from_id = ? AND m.to_id = ?)
      ORDER BY m.created_at ASC
    `, [req.user.id, req.params.contactId, req.params.contactId, req.user.id]);

    await db.query(
      'UPDATE messages SET is_read = 1 WHERE to_id = ? AND from_id = ? AND is_read = 0',
      [req.user.id, req.params.contactId]
    );

    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Gửi tin nhắn ────────────────────────────────────────────────────────────
router.post('/', auth, v.message.send, async (req, res) => {
  try {
    const { to_id, message } = req.body;

    await db.query(
      'INSERT INTO messages (from_id, to_id, message) VALUES (?,?,?)',
      [req.user.id, to_id, message]
    );

    const [senders] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const senderName = senders[0]?.name || 'Ai đó';

    // Gửi push notification
    await sendPushToUser(to_id, {
      title: `💬 ${senderName}`,
      body:  message.length > 50 ? message.slice(0, 50) + '...' : message,
      url:   '/chat',
    });

    res.json({ success: true, message: 'Đã gửi!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── Lấy danh sách contacts ───────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT
        CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END AS contact_id,
        u.name, u.role,
        MAX(m.created_at) AS last_time,
        (SELECT message FROM messages
         WHERE (from_id = ? AND to_id = u.id) OR (from_id = u.id AND to_id = ?)
         ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*) FROM messages
         WHERE from_id = u.id AND to_id = ? AND is_read = 0) AS unread_count
      FROM messages m
      LEFT JOIN users u ON u.id = CASE WHEN m.from_id = ? THEN m.to_id ELSE m.from_id END
      WHERE m.from_id = ? OR m.to_id = ?
      GROUP BY contact_id, u.name, u.role
      ORDER BY last_time DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);

    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;