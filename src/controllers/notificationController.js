const db    = require('../models/db');
const axios = require('axios');
const { sendPushToUser } = require('../routes/push');
const { emitToUser, emitToAll, emitToTeachers, emitToAdmins } = require('../socket');
require('dotenv').config();

const ZALO_TOKEN = process.env.ZALO_OA_TOKEN;
const ZALO_URL   = 'https://openapi.zalo.me/v2.0/oa/message';

const sendZaloMessage = async (userId, message) => {
  try {
    await axios.post(ZALO_URL, {
      recipient: { user_id: userId },
      message:   { text: message },
    }, {
      headers: { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' }
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
        FROM notifications n LEFT JOIN users u ON n.sent_by = u.id
        ORDER BY n.created_at DESC LIMIT 30
      `);
      return res.json({ success: true, rows });
    }
    if (role === 'teacher') {
      const [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n LEFT JOIN users u ON n.sent_by = u.id
        WHERE n.recipient IN ('all', 'teachers') OR n.recipient = ?
        ORDER BY n.created_at DESC LIMIT 30
      `, [`teacher:${req.user.id}`]);
      return res.json({ success: true, rows });
    }
    if (role === 'student') {
      const [rows] = await db.query(`
        SELECT n.*, u.name AS sender_name
        FROM notifications n LEFT JOIN users u ON n.sent_by = u.id
        WHERE n.recipient = 'all' OR n.recipient = 'students'
        ORDER BY n.created_at DESC LIMIT 20
      `);
      return res.json({ success: true, rows });
    }
    res.json({ success: true, rows: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Gửi thông báo: lưu DB + (tùy chọn) push + (tùy chọn) banner + Zalo + real-time Socket
exports.send = async (req, res) => {
  try {
    const {
      title, message, recipient, specific_ids,
      send_push = true,
      show_banner = false,
      banner_type = 'info',
      banner_start = null,
      banner_end = null,
    } = req.body;

    if (!title || !message) return res.status(400).json({ message: 'Thiếu tiêu đề hoặc nội dung!' });

    // 1. Lưu vào DB
    await db.query(
      `INSERT INTO notifications
       (title, message, type, recipient, sent_by, show_banner, banner_type, banner_start, banner_end, banner_active)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [
        title, message, 'manual', recipient, req.user.id,
        show_banner ? 1 : 0,
        banner_type,
        show_banner ? banner_start : null,
        show_banner ? banner_end   : null,
      ]
    );

    // 2. Xác định người nhận
    let users = [];
    if (recipient === 'all') {
      [users] = await db.query("SELECT * FROM users WHERE status = 'active'");
    } else if (recipient === 'students') {
      [users] = await db.query("SELECT * FROM users WHERE role = 'student' AND status = 'active'");
    } else if (recipient === 'teachers') {
      [users] = await db.query("SELECT * FROM users WHERE role = 'teacher' AND status = 'active'");
    } else if (recipient === 'specific' && specific_ids?.length) {
      [users] = await db.query('SELECT * FROM users WHERE id IN (?)', [specific_ids]);
    }

    // 3. Web push
    let pushSent = 0;
    if (send_push) {
      const payload = { title, body: message, url: '/' };
      const results = await Promise.allSettled(users.map(u => sendPushToUser(u.id, payload)));
      pushSent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    }

    // 4. Zalo
    let zaloSent = 0;
    if (ZALO_TOKEN && ZALO_TOKEN !== 'your_oa_access_token_here') {
      for (const user of users) {
        if (user.zalo_id) {
          const ok = await sendZaloMessage(user.zalo_id, `${title}\n\n${message}`);
          if (ok) zaloSent++;
        }
      }
    }

    // 5. ── Real-time Socket.IO ──
    const socketPayload = {
      title,
      message,
      type: 'notification',
      sentBy: req.user?.name || 'Admin',
      sentAt: new Date().toISOString(),
    };

    try {
      if (recipient === 'all') {
        emitToAll('notification:new', socketPayload);
      } else if (recipient === 'teachers') {
        emitToTeachers('notification:new', socketPayload);
      } else if (recipient === 'specific' && specific_ids?.length) {
        for (const uid of specific_ids) {
          emitToUser(uid, 'notification:new', socketPayload);
        }
      } else {
        emitToAll('notification:new', socketPayload);
      }
    } catch (_) { /* socket not ready */ }

    res.json({
      success: true,
      message: `Đã gửi thông báo cho ${users.length} người!`,
      total:   users.length,
      push:    pushSent,
      banner:  show_banner ? 1 : 0,
      zalo:    zaloSent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lấy banner đang hiển thị
exports.getBanners = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, title, message, banner_type AS type, banner_start, banner_end
      FROM notifications
      WHERE show_banner = 1 AND banner_active = 1
        AND (banner_start IS NULL OR banner_start <= CURDATE())
        AND (banner_end   IS NULL OR banner_end   >= CURDATE())
      ORDER BY created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Ẩn banner
exports.hideBanner = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET banner_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã ẩn banner!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lịch sử thông báo
exports.getHistory = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, u.name AS sender_name
      FROM notifications n LEFT JOIN users u ON n.sent_by = u.id
      ORDER BY n.created_at DESC LIMIT 50
    `);
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};