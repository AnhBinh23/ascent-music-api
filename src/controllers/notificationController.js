const db    = require('../models/db');
const axios = require('axios');
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

// Lấy thông báo cho user hiện tại (dashboard)
exports.getForUser = async (req, res) => {
  try {
    const { role } = req.user;

    const recipientFilter = role === 'student'
      ? 'students'
      : role === 'teacher'
        ? 'teachers'
        : null;

    let rows;
    if (recipientFilter) {
      [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n
        LEFT JOIN users u ON n.sent_by = u.id
        WHERE n.recipient = 'all' OR n.recipient = ?
        ORDER BY n.created_at DESC
        LIMIT 20
      `, [recipientFilter]);
    } else {
      // admin xem tất cả
      [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n
        LEFT JOIN users u ON n.sent_by = u.id
        ORDER BY n.created_at DESC
        LIMIT 20
      `);
    }

    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Gửi thông báo
exports.send = async (req, res) => {
  try {
    const { title, message, recipient, specific_ids } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Thiếu tiêu đề hoặc nội dung!' });

    await db.query(
      'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
      [title, message, 'manual', recipient, req.user.id]
    );

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