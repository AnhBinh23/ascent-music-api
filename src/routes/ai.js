const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

const callGemini = async (systemPrompt, userMessage) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nYêu cầu: ${userMessage}` }]
        }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
      })
    }
  );
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể xử lý yêu cầu.';
};

// ① Trợ lý AI cho Admin/Giáo viên
router.post('/assistant', auth, role('admin', 'teacher'), async (req, res) => {
  try {
    const { question } = req.body;
    const [students]  = await db.query("SELECT id, name, phone, status FROM users WHERE role = 'student' AND status = 'active'");
    const [tuition]   = await db.query("SELECT t.*, u.name as student_name FROM tuition t JOIN users u ON t.student_id = u.id ORDER BY t.created_at DESC LIMIT 50");
    const [classes]   = await db.query('SELECT c.*, u.name as teacher_name FROM classes c LEFT JOIN users u ON c.teacher_id = u.id');
    const [schedules] = await db.query('SELECT s.*, c.name as class_name FROM schedules s JOIN classes c ON s.class_id = c.id WHERE s.date >= CURDATE() ORDER BY s.date LIMIT 30');

    const context = `
Dữ liệu trung tâm âm nhạc Ascent Music Center:
HỌC VIÊN (${students.length} người): ${JSON.stringify(students)}
HỌC PHÍ: ${JSON.stringify(tuition.slice(0, 20))}
LỚP HỌC: ${JSON.stringify(classes)}
LỊCH HỌC SẮP TỚI: ${JSON.stringify(schedules.slice(0, 20))}`;

    const answer = await callGemini(
      `Bạn là trợ lý AI của trung tâm âm nhạc Ascent Music Center Việt Nam.
Dưới đây là dữ liệu thực tế. Hãy trả lời câu hỏi dựa trên dữ liệu này.
Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng.
${context}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ② Chatbot phụ huynh/học viên
router.post('/parent-chat', auth, async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.id;

    const [schedules]  = await db.query(`
      SELECT s.*, c.name as class_name, u.name as teacher_name
      FROM schedules s
      JOIN classes c ON s.class_id = c.id
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE c.id IN (SELECT class_id FROM enrollments WHERE student_id = ?)
      AND s.date >= CURDATE()
      ORDER BY s.date LIMIT 10
    `, [userId]);
    const [tuition]    = await db.query('SELECT * FROM tuition WHERE student_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
    const [attendance] = await db.query('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 10', [userId]);
    const [userInfo]   = await db.query('SELECT name, email, phone FROM users WHERE id = ?', [userId]);

    const answer = await callGemini(
      `Bạn là trợ lý AI của trung tâm âm nhạc Ascent Music Center, hỗ trợ phụ huynh và học viên 24/7.
Thông tin học viên: ${JSON.stringify(userInfo[0])}
Lịch học: ${JSON.stringify(schedules)}
Học phí: ${JSON.stringify(tuition)}
Điểm danh: ${JSON.stringify(attendance)}
Trả lời thân thiện bằng tiếng Việt.`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ③ Nhận xét học viên tự động
router.post('/feedback', auth, role('admin', 'teacher'), async (req, res) => {
  try {
    const { studentName, subject, score, notes, period } = req.body;

    const feedback = await callGemini(
      `Bạn là giáo viên âm nhạc chuyên nghiệp tại Ascent Music Center.
Viết nhận xét đánh giá học viên để gửi phụ huynh: tích cực, động viên, 3-4 câu.
Đề cập điểm mạnh và góc cần cải thiện. Kết bằng lời động viên.
Trả lời bằng tiếng Việt.`,
      `Học viên: ${studentName} | Môn: ${subject} | Điểm: ${score} | Ghi chú: ${notes || 'Không có'} | Kỳ: ${period || 'Tháng này'}`
    );

    res.json({ success: true, feedback });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ④ Phân tích báo cáo kinh doanh
router.post('/report', auth, role('admin'), async (req, res) => {
  try {
    const [students]   = await db.query("SELECT COUNT(*) as total, status FROM users WHERE role = 'student' GROUP BY status");
    const [tuition]    = await db.query("SELECT SUM(amount) as total, SUM(paid) as paid, MONTH(created_at) as month FROM tuition GROUP BY MONTH(created_at) ORDER BY month DESC LIMIT 6");
    const [classes]    = await db.query("SELECT c.name, COUNT(e.id) as students FROM classes c LEFT JOIN enrollments e ON c.id = e.class_id GROUP BY c.id");
    const [attendance] = await db.query("SELECT AVG(CASE WHEN status='present' THEN 1 ELSE 0 END)*100 as rate FROM attendance WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)");

    const analysis = await callGemini(
      `Bạn là chuyên gia phân tích kinh doanh cho trung tâm âm nhạc.
Phân tích dữ liệu và đưa ra gợi ý cải thiện cụ thể.
Trả lời bằng tiếng Việt với các mục: Tình hình hiện tại, Điểm mạnh, Điểm cần cải thiện, Gợi ý hành động.`,
      `Dữ liệu trung tâm:
- Học viên: ${JSON.stringify(students)}
- Doanh thu 6 tháng: ${JSON.stringify(tuition)}
- Sĩ số lớp: ${JSON.stringify(classes)}
- Tỷ lệ điểm danh: ${JSON.stringify(attendance)}`
    );

    res.json({ success: true, analysis });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ⑤ Soạn thông báo
router.post('/compose', auth, async (req, res) => {
  try {
    const { input, tone, recipient } = req.body;
    const toneMap      = { lich_su: 'lịch sự trang trọng', than_thien: 'thân thiện gần gũi', ngan_gon: 'ngắn gọn súc tích' };
    const recipientMap = { phu_huynh: 'phụ huynh', hoc_vien: 'học viên', giao_vien: 'giáo viên', tat_ca: 'tất cả' };

    const text = await callGemini(
      `Bạn là trợ lý soạn thông báo cho trung tâm âm nhạc Ascent Music Center.
Soạn thông báo ${toneMap[tone] || 'lịch sự'} gửi đến ${recipientMap[recipient] || 'phụ huynh'}.
Có: lời chào, nội dung chính, liên hệ 0901 234 567, lời kết và tên trung tâm.
Chỉ trả về nội dung thông báo, không giải thích thêm.`,
      input
    );

    res.json({ success: true, text });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;