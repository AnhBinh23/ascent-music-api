const db    = require('../models/db');
const axios = require('axios');
const { sendPushToUser } = require('../routes/push');
require('dotenv').config();

const ZALO_TOKEN = process.env.ZALO_OA_TOKEN;
const ZALO_URL   = 'https://openapi.zalo.me/v2.0/oa/message';

const sendZaloMessage = async (userId, message) => {
  try {
    await axios.post(ZALO_URL, {
      recipient: { user_id: userId },
      message:   { text: message },
    }, {
      headers: {
        'access_token': ZALO_TOKEN,
        'Content-Type': 'application/json',
      }
    });
    return true;
  } catch (err) {
    console.error('Zalo error:', err.response?.data || err.message);
    return false;
  }
};

// Lấy thông báo cho user hiện tại (theo role)
exports.getForUser = async (req, res) => {
  try {
    const { role } = req.user;

    if (role === 'admin') {
      const [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n
        LEFT JOIN users u ON n.sent_by = u.id
        ORDER BY n.created_at DESC
        LIMIT 30
      `);
      return res.json({ success: true, rows });
    }

    if (role === 'teacher') {
      const [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n
        LEFT JOIN users u ON n.sent_by = u.id
        WHERE n.recipient = 'all' OR n.recipient = 'teachers'
        ORDER BY n.created_at DESC
        LIMIT 20
      `);
      return res.json({ success: true, rows });
    }

    if (role === 'student') {
      const [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n
        LEFT JOIN users u ON n.sent_by = u.id
        WHERE n.recipient = 'all' OR n.recipient = 'students'
        ORDER BY n.created_at DESC
        LIMIT 20
      `);
      return res.json({ success: true, rows });
    }

    res.json({ success: true, rows: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Gửi thông báo (lưu DB + web push + Zalo)
exports.send = async (req, res) => {
  try {
    const { title, message, recipient, specific_ids } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Thiếu tiêu đề hoặc nội dung!' });

    // 1. Lưu vào DB
    await db.query(
      'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
      [title, message, 'manual', recipient, req.user.id]
    );

    // 2. Xác định danh sách người nhận
    let users = [];
    if (recipient === 'all') {
      const [rows] = await db.query("SELECT * FROM users WHERE status = 'active'");
      users = rows;
    } else if (recipient === 'students') {
      const [rows] = await db.query("SELECT * FROM users WHERE role = 'student' AND status = 'active'");
      users = rows;
    } else if (recipient === 'teachers') {
      const [rows] = await db.query("SELECT * FROM users WHERE role = 'teacher' AND status = 'active'");
      users = rows;
    } else if (recipient === 'specific' && specific_ids?.length) {
      const [rows] = await db.query('SELECT * FROM users WHERE id IN (?)', [specific_ids]);
      users = rows;
    }

    // 3. Gửi WEB PUSH tới điện thoại/trình duyệt (kể cả khi không mở app)
    let pushSent = 0;
    const payload = { title, body: message, url: '/' };
    const pushResults = await Promise.allSettled(
      users.map(user => sendPushToUser(user.id, payload))
    );
    pushSent = pushResults.filter(r => r.status === 'fulfilled').length;

    // 4. Gửi Zalo (nếu đã cấu hình OA Token)
    let zaloSent = 0;
    if (ZALO_TOKEN && ZALO_TOKEN !== 'your_oa_access_token_here') {
      for (const user of users) {
        if (user.zalo_id) {
          const ok = await sendZaloMessage(user.zalo_id, `${title}\n\n${message}`);
          if (ok) zaloSent++;
        }
      }
    }

    res.json({
      success: true,
      message: `Đã gửi thông báo cho ${users.length} người!`,
      total:   users.length,
      push:    pushSent,
      zalo:    zaloSent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lịch sử thông báo (admin)
exports.getHistory = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, u.name AS sender_name
      FROM notifications n
      LEFT JOIN users u ON n.sent_by = u.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};