const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

// ── Gọi Groq AI ──
const callAI = async (systemPrompt, userMessage, maxTokens = 800) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    })
  });

  // Rate limit (quá nhiều request / token trong 1 phút)
  if (response.status === 429) throw new Error('RATE_LIMIT');

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || 'Không thể xử lý yêu cầu.';
};

// Helper xử lý lỗi chung
const handleErr = (res, err, label) => {
  console.error(`${label} error:`, err.message);
  if (err.message === 'RATE_LIMIT') {
    return res.status(429).json({ message: 'AI đang quá tải, vui lòng đợi vài giây rồi thử lại.' });
  }
  res.status(500).json({ message: err.message || 'Có lỗi xảy ra với AI.' });
};

// ════════════════════════════════════════════════
// ① Trợ lý AI cho Admin / Giáo viên
//    → Context là SUMMARY tính sẵn (gọn token, tránh rate limit)
// ════════════════════════════════════════════════
router.post('/assistant', auth, role('admin', 'teacher'), async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Thiếu câu hỏi!' });

    // Chạy song song các query tổng hợp (nhẹ, đã aggregate sẵn)
    const [
      [[cntStudents]], [[cntTeachers]], [[cntClasses]],
      [unpaid], [today], [byTeacher], [byClassSize],
      [revenue], [topAbsent],
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS n FROM students WHERE status='active'"),
      db.query("SELECT COUNT(*) AS n FROM teachers"),
      db.query("SELECT COUNT(*) AS n FROM classes WHERE status='Đang học'"),

      // HV chưa đóng đủ học phí
      db.query(`
        SELECT s.name, t.amount, t.paid
        FROM tuition t JOIN students s ON t.student_id = s.id
        WHERE t.status != 'Đã thanh toán'
        ORDER BY (t.amount - t.paid) DESC LIMIT 30
      `),

      // Buổi học hôm nay (DAYOFWEEK: 1=CN..7=T7, khớp convention DB)
      db.query(`
        SELECT c.name AS class_name, sc.time_start, sc.time_end, t.name AS teacher_name
        FROM schedules sc
        JOIN classes c ON sc.class_id = c.id
        LEFT JOIN teachers t ON sc.teacher_id = t.id
        WHERE sc.day_of_week = DAYOFWEEK(CURDATE()) AND sc.status = 'active'
        ORDER BY sc.time_start
      `),

      // GV dạy nhiều lớp nhất
      db.query(`
        SELECT t.name, COUNT(c.id) AS so_lop
        FROM classes c JOIN teachers t ON c.teacher_id = t.id
        WHERE c.status = 'Đang học'
        GROUP BY t.id, t.name ORDER BY so_lop DESC
      `),

      // Sĩ số mỗi lớp
      db.query(`
        SELECT c.name, COUNT(cs.student_id) AS so_hv
        FROM classes c LEFT JOIN class_students cs ON c.id = cs.class_id
        WHERE c.status = 'Đang học'
        GROUP BY c.id, c.name ORDER BY so_hv ASC
      `),

      // Doanh thu 2 tháng gần nhất
      db.query(`
        SELECT DATE_FORMAT(created_at, '%m/%Y') AS thang, SUM(paid) AS thu
        FROM tuition
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
        GROUP BY thang ORDER BY thang
      `),

      // HV vắng nhiều nhất
      db.query(`
        SELECT s.name, COUNT(*) AS so_vang
        FROM attendance a JOIN students s ON a.student_id = s.id
        WHERE a.status = 'absent'
        GROUP BY s.id, s.name ORDER BY so_vang DESC LIMIT 5
      `),
    ]);

    // ── Build context GỌN (text, không phải JSON thô) ──
    const unpaidText = unpaid.length
      ? unpaid.map(u => `${u.name} (còn ${fmt(u.amount - u.paid)})`).join('; ')
      : 'Không có ai nợ học phí';

    const todayText = today.length
      ? today.map(s => `${s.class_name} ${String(s.time_start).slice(0,5)}-${String(s.time_end).slice(0,5)} (GV: ${s.teacher_name || '?'})`).join('; ')
      : 'Hôm nay không có buổi học nào';

    const teacherText = byTeacher.map(t => `${t.name}: ${t.so_lop} lớp`).join('; ');
    const classSizeText = byClassSize.map(c => `${c.name}: ${c.so_hv} HV`).join('; ');
    const revenueText = revenue.map(r => `${r.thang}: ${fmt(r.thu)}`).join(' | ');
    const absentText = topAbsent.length
      ? topAbsent.map(a => `${a.name}: ${a.so_vang} buổi`).join('; ')
      : 'Chưa có dữ liệu điểm danh vắng';

    const context = `DỮ LIỆU TRUNG TÂM ASCENT MUSIC CENTER (cập nhật thời gian thực):

TỔNG QUAN: ${cntStudents.n} học viên đang học, ${cntTeachers.n} giáo viên, ${cntClasses.n} lớp đang hoạt động.

BUỔI HỌC HÔM NAY: ${todayText}.

HỌC PHÍ CHƯA ĐÓNG ĐỦ: ${unpaidText}.

SĨ SỐ TỪNG LỚP (sắp xếp ít → nhiều): ${classSizeText}.

GIÁO VIÊN & SỐ LỚP (nhiều → ít): ${teacherText}.

DOANH THU GẦN ĐÂY: ${revenueText}.

HỌC VIÊN VẮNG NHIỀU NHẤT: ${absentText}.`;

    const answer = await callAI(
      `Bạn là trợ lý AI của trung tâm âm nhạc Ascent Music Center (Việt Nam).
Trả lời NGẮN GỌN, rõ ràng, bằng tiếng Việt, dựa CHÍNH XÁC trên dữ liệu dưới đây.
Nếu dữ liệu không có thông tin cần thiết, nói thẳng là chưa có dữ liệu.

${context}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) { handleErr(res, err, 'assistant'); }
});

// ════════════════════════════════════════════════
// ② Chatbot cho học viên / phụ huynh (dữ liệu cá nhân)
// ════════════════════════════════════════════════
router.post('/parent-chat', auth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Thiếu câu hỏi!' });
    const userId = req.user.id;

    // user.id (student-xxx) → students.id (hv-xxx)
    const [[stu]] = await db.query('SELECT id, name FROM students WHERE user_id = ? LIMIT 1', [userId]);
    const studentId = stu?.id;

    let tuitionText = 'Chưa có dữ liệu học phí';
    let scheduleText = 'Chưa có lịch học';
    let attendText = 'Chưa có dữ liệu điểm danh';

    if (studentId) {
      const [tuition] = await db.query(
        `SELECT amount, paid, status, month FROM tuition WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
        [studentId]
      );
      tuitionText = tuition.length
        ? tuition.map(t => `${t.month || ''} ${fmt(t.amount)} - ${t.status} (đã trả ${fmt(t.paid)})`).join('; ')
        : tuitionText;

      const [schedules] = await db.query(`
        SELECT c.name AS class_name, sc.day_of_week, sc.time_start, sc.time_end, t.name AS teacher_name
        FROM class_students cs
        JOIN classes c ON cs.class_id = c.id
        JOIN schedules sc ON sc.class_id = c.id
        LEFT JOIN teachers t ON sc.teacher_id = t.id
        WHERE cs.student_id = ? AND sc.status = 'active'
        ORDER BY sc.day_of_week, sc.time_start
      `, [studentId]);
      const DAY = { 1:'CN', 2:'T2', 3:'T3', 4:'T4', 5:'T5', 6:'T6', 7:'T7' };
      scheduleText = schedules.length
        ? schedules.map(s => `${DAY[s.day_of_week]} ${String(s.time_start).slice(0,5)}-${String(s.time_end).slice(0,5)} ${s.class_name} (GV: ${s.teacher_name || '?'})`).join('; ')
        : scheduleText;

      const [[att]] = await db.query(`
        SELECT
          SUM(status='present') AS co_mat,
          SUM(status='absent')  AS vang,
          COUNT(*) AS tong
        FROM attendance WHERE student_id = ?
      `, [studentId]);
      if (att?.tong > 0) {
        attendText = `Có mặt ${att.co_mat}/${att.tong} buổi, vắng ${att.vang} buổi`;
      }
    }

    const answer = await callAI(
      `Bạn là trợ lý AI của trung tâm âm nhạc Ascent Music Center, hỗ trợ học viên/phụ huynh.
Trả lời thân thiện, ngắn gọn bằng tiếng Việt, dựa trên thông tin cá nhân dưới đây.

Học viên: ${stu?.name || 'không xác định'}
Lịch học: ${scheduleText}
Học phí: ${tuitionText}
Điểm danh: ${attendText}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) { handleErr(res, err, 'parent-chat'); }
});

// ════════════════════════════════════════════════
// ③ Tạo nhận xét học viên tự động
// ════════════════════════════════════════════════
router.post('/feedback', auth, role('admin', 'teacher'), async (req, res) => {
  try {
    const { studentName, subject, score, notes, period } = req.body;

    const feedback = await callAI(
      `Bạn là giáo viên âm nhạc chuyên nghiệp tại Ascent Music Center.
Viết nhận xét đánh giá học viên để gửi phụ huynh: tích cực, động viên, 3-4 câu.
Đề cập điểm mạnh và điểm cần cải thiện. Kết thúc bằng lời khích lệ. Chỉ trả về nội dung nhận xét.`,
      `Học viên: ${studentName} | Môn: ${subject} | Điểm: ${score || 'N/A'} | Ghi chú GV: ${notes || 'không có'} | Kỳ: ${period || 'này'}`
    );

    res.json({ success: true, feedback });
  } catch (err) { handleErr(res, err, 'feedback'); }
});

// ════════════════════════════════════════════════
// ④ Phân tích báo cáo kinh doanh
// ════════════════════════════════════════════════
router.post('/report', auth, role('admin'), async (req, res) => {
  try {
    const [[students]]  = await db.query("SELECT COUNT(*) AS n FROM students WHERE status='active'");
    const [[classes]]   = await db.query("SELECT COUNT(*) AS n FROM classes WHERE status='Đang học'");
    const [revenue]     = await db.query(`
      SELECT DATE_FORMAT(created_at, '%m/%Y') AS thang,
             SUM(paid) AS da_thu,
             SUM(amount - paid) AS con_no
      FROM tuition
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY thang ORDER BY thang
    `);
    const [[attRate]] = await db.query(`
      SELECT ROUND(SUM(status='present') * 100.0 / NULLIF(COUNT(*),0), 1) AS ti_le
      FROM attendance
    `);

    const revenueText = revenue.map(r => `${r.thang}: thu ${fmt(r.da_thu)}, nợ ${fmt(r.con_no)}`).join(' | ');

    const analysis = await callAI(
      `Bạn là chuyên gia phân tích kinh doanh cho trung tâm âm nhạc Ascent Music Center.
Phân tích dữ liệu dưới đây bằng tiếng Việt: nêu xu hướng, điểm tốt, rủi ro và 2-3 đề xuất cụ thể.`,
      `Số HV đang học: ${students.n} | Số lớp: ${classes.n} | Tỉ lệ điểm danh: ${attRate?.ti_le || 0}%
Doanh thu 6 tháng: ${revenueText}`,
      1000
    );

    res.json({ success: true, analysis });
  } catch (err) { handleErr(res, err, 'report'); }
});

// ════════════════════════════════════════════════
// ⑤ Soạn thông báo
// ════════════════════════════════════════════════
router.post('/compose', auth, async (req, res) => {
  try {
    const { input, tone, recipient } = req.body;
    const toneMap      = { lich_su: 'lịch sự trang trọng', than_thien: 'thân thiện gần gũi', ngan_gon: 'ngắn gọn súc tích' };
    const recipientMap = { phu_huynh: 'phụ huynh', hoc_vien: 'học viên', giao_vien: 'giáo viên', tat_ca: 'tất cả' };

    const text = await callAI(
      `Bạn là trợ lý soạn thông báo cho trung tâm âm nhạc Ascent Music Center.
Soạn thông báo giọng ${toneMap[tone] || 'lịch sự'} gửi đến ${recipientMap[recipient] || 'phụ huynh'}.
Chỉ trả về nội dung thông báo, không giải thích thêm.`,
      input
    );

    res.json({ success: true, text });
  } catch (err) { handleErr(res, err, 'compose'); }
});

module.exports = router;