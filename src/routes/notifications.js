const router = require('express').Router();
const ctrl   = require('../controllers/notificationController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// Lấy thông báo cho user hiện tại
router.get('/', auth, ctrl.getForUser);

// Gửi thông báo
router.post('/', auth, role('admin', 'teacher'), ctrl.send);

// Lịch sử thông báo
router.get('/history', auth, ctrl.getHistory);

// ─── Banner hiển thị trong app ───
router.get('/banners', auth, ctrl.getBanners);                              // mọi user xem banner đang hiện
router.put('/banners/:id/hide', auth, role('admin', 'teacher'), ctrl.hideBanner);  // admin ẩn banner

// Webhook Zalo
router.post('/zalo/webhook', async (req, res) => {
  try {
    const { event_name, follower } = req.body;
    console.log('📱 Zalo webhook nhận:', event_name, follower);

    if (event_name === 'follow' && follower?.id) {
      const [users] = await db.query('SELECT * FROM users WHERE phone = ?', [follower.phone]);
      if (users.length) {
        await db.query('UPDATE users SET zalo_id = ? WHERE phone = ?', [follower.id, follower.phone]);
        console.log(`✅ Đã lưu Zalo ID cho ${follower.display_name}: ${follower.id}`);
      } else {
        console.log(`⚠️ Không tìm thấy user với SĐT: ${follower.phone}`);
      }
    }

    if (event_name === 'unfollow' && follower?.id) {
      await db.query('UPDATE users SET zalo_id = NULL WHERE zalo_id = ?', [follower.id]);
      console.log(`❌ Học viên ${follower.display_name} đã hủy follow OA`);
    }

    res.json({ error: 0 });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).json({ error: 1 });
  }
});

// Lấy danh sách user đã có Zalo ID
router.get('/zalo/followers', auth, role('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, phone, role, zalo_id FROM users WHERE zalo_id IS NOT NULL'
    );
    res.json({ success: true, rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cập nhật Zalo ID thủ công
router.put('/zalo/update/:userId', auth, role('admin'), async (req, res) => {
  try {
    const { zalo_id } = req.body;
    await db.query('UPDATE users SET zalo_id = ? WHERE id = ?', [zalo_id, req.params.userId]);
    res.json({ success: true, message: 'Cập nhật Zalo ID thành công!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;