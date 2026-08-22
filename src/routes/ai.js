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
      model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    })
  });
  if (response.status === 429) throw new Error('RATE_LIMIT');
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  let text = data.choices?.[0]?.message?.content || 'Không thể xử lý yêu cầu.';
  // Loại bỏ <think>...</think> từ model reasoning
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return text;
};

const handleErr = (res, err, label) => {
  console.error(`${label} error:`, err.message);
  if (err.message === 'RATE_LIMIT') {
    return res.status(429).json({ message: 'AI đang quá tải, vui lòng đợi vài giây rồi thử lại.' });
  }
  res.status(500).json({ message: err.message || 'Có lỗi xảy ra với AI.' });
};

// ════════════════════════════════════════════════
// ① AI ADMIN — quản lý toàn trung tâm
// ════════════════════════════════════════════════
router.post('/assistant', auth, role('admin'), async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Thiếu câu hỏi!' });

    const [
      [[cntStudents]], [[cntTeachers]], [[cntClasses]],
      [unpaid], [today], [byTeacher], [byClassSize],
      [revenue], [topAbsent],
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS n FROM students WHERE status='active'"),
      db.query("SELECT COUNT(*) AS n FROM teachers"),
      db.query("SELECT COUNT(*) AS n FROM classes WHERE status='Đang học'"),
      db.query(`
        SELECT s.name, t.amount, t.paid
        FROM tuition t JOIN students s ON t.student_id = s.id
        WHERE t.status != 'Đã thanh toán'
        ORDER BY (t.amount - t.paid) DESC LIMIT 30
      `),
      db.query(`
        SELECT c.name AS class_name, sc.time_start, sc.time_end, t.name AS teacher_name
        FROM schedules sc
        JOIN classes c ON sc.class_id = c.id
        LEFT JOIN teachers t ON sc.teacher_id = t.id
        WHERE sc.day_of_week = DAYOFWEEK(CURDATE()) AND sc.status = 'active'
        ORDER BY sc.time_start
      `),
      db.query(`
        SELECT t.name, COUNT(c.id) AS so_lop
        FROM classes c JOIN teachers t ON c.teacher_id = t.id
        WHERE c.status = 'Đang học'
        GROUP BY t.id, t.name ORDER BY so_lop DESC
      `),
      db.query(`
        SELECT c.name, COUNT(cs.student_id) AS so_hv
        FROM classes c LEFT JOIN class_students cs ON c.id = cs.class_id
        WHERE c.status = 'Đang học'
        GROUP BY c.id, c.name ORDER BY so_hv ASC
      `),
      db.query(`
        SELECT DATE_FORMAT(created_at, '%m/%Y') AS thang, SUM(paid) AS thu
        FROM tuition
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
        GROUP BY thang ORDER BY thang
      `),
      db.query(`
        SELECT s.name, COUNT(*) AS so_vang
        FROM attendance a JOIN students s ON a.student_id = s.id
        WHERE a.status = 'absent'
        GROUP BY s.id, s.name ORDER BY so_vang DESC LIMIT 5
      `),
    ]);

    const context = `DỮ LIỆU ASCENT MUSIC CENTER:
TỔNG QUAN: ${cntStudents.n} HV, ${cntTeachers.n} GV, ${cntClasses.n} lớp đang học.
HÔM NAY: ${today.length ? today.map(s => `${s.class_name} ${String(s.time_start).slice(0,5)}-${String(s.time_end).slice(0,5)} (${s.teacher_name})`).join('; ') : 'Không có buổi học'}.
HỌC PHÍ CHƯA ĐỦ: ${unpaid.length ? unpaid.map(u => `${u.name} (còn ${fmt(u.amount - u.paid)})`).join('; ') : 'Không có'}.
SĨ SỐ LỚP: ${byClassSize.map(c => `${c.name}: ${c.so_hv} HV`).join('; ')}.
GV & SỐ LỚP: ${byTeacher.map(t => `${t.name}: ${t.so_lop} lớp`).join('; ')}.
DOANH THU: ${revenue.map(r => `${r.thang}: ${fmt(r.thu)}`).join(' | ')}.
VẮNG NHIỀU NHẤT: ${topAbsent.length ? topAbsent.map(a => `${a.name}: ${a.so_vang} buổi`).join('; ') : 'Chưa có dữ liệu'}.`;

    const answer = await callAI(
      `Bạn là trợ lý AI quản lý của trung tâm âm nhạc Ascent Music Center.
Vai trò: hỗ trợ ban giám đốc/admin quản lý toàn bộ trung tâm — học viên, giáo viên, doanh thu, lớp học.
Trả lời NGẮN GỌN, rõ ràng, bằng tiếng Việt, dựa CHÍNH XÁC trên dữ liệu.
Nếu không có dữ liệu, nói thẳng là chưa có.

${context}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) { handleErr(res, err, 'assistant-admin'); }
});

// ════════════════════════════════════════════════
// ② AI GIÁO VIÊN — chỉ thấy dữ liệu lớp mình dạy
// ════════════════════════════════════════════════
router.post('/teacher-chat', auth, role('teacher'), async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Thiếu câu hỏi!' });
    const userId = req.user.id;

    // Lấy teacher_id từ user_id
    const [[teacher]] = await db.query(
      'SELECT id, name, instrument FROM teachers WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (!teacher) return res.status(404).json({ message: 'Không tìm thấy giáo viên!' });

    const [classes, schedules, students, attendance, unpaidStudents] = await Promise.all([
      // Lớp đang dạy
      db.query(`
        SELECT c.name, c.type, c.status,
          COUNT(cs.student_id) AS so_hv
        FROM classes c
        LEFT JOIN class_students cs ON c.id = cs.class_id
        WHERE c.teacher_id = ? AND c.status = 'Đang học'
        GROUP BY c.id, c.name, c.type, c.status
        ORDER BY c.name
      `, [teacher.id]),

      // Lịch dạy
      db.query(`
        SELECT c.name AS class_name, sc.day_of_week, sc.time_start, sc.time_end
        FROM schedules sc
        JOIN classes c ON sc.class_id = c.id
        WHERE sc.teacher_id = ? AND sc.status = 'active'
        ORDER BY sc.day_of_week, sc.time_start
      `, [teacher.id]),

      // Học viên của mình
      db.query(`
        SELECT DISTINCT s.name, s.total_sessions,
          c.name AS class_name,
          COUNT(CASE WHEN a.status='present' THEN 1 END) AS co_mat,
          COUNT(CASE WHEN a.status='absent'  THEN 1 END) AS vang
        FROM class_students cs
        JOIN classes c  ON cs.class_id  = c.id
        JOIN students s ON cs.student_id = s.id
        LEFT JOIN attendance a ON a.student_id = s.id AND a.class_id = c.id
        WHERE c.teacher_id = ? AND c.status = 'Đang học'
        GROUP BY s.id, s.name, s.total_sessions, c.name
        ORDER BY s.name
      `, [teacher.id]),

      // Điểm danh tháng này
      db.query(`
        SELECT s.name, a.date, a.status
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        JOIN classes  c ON a.class_id   = c.id
        WHERE c.teacher_id = ?
          AND MONTH(a.date) = MONTH(CURDATE())
          AND YEAR(a.date)  = YEAR(CURDATE())
        ORDER BY a.date DESC LIMIT 20
      `, [teacher.id]),

      // HV chưa đóng học phí
      db.query(`
        SELECT s.name, t.amount, t.paid
        FROM tuition t
        JOIN students s ON t.student_id = s.id
        JOIN classes  c ON t.class_id   = c.id
        WHERE c.teacher_id = ? AND t.status != 'Đã thanh toán'
      `, [teacher.id]),
    ]);

    const DAY = { 1:'CN', 2:'T2', 3:'T3', 4:'T4', 5:'T5', 6:'T6', 7:'T7' };
    const schedText   = schedules[0].length
      ? schedules[0].map(s => `${DAY[s.day_of_week]} ${String(s.time_start).slice(0,5)}-${String(s.time_end).slice(0,5)} (${s.class_name})`).join('; ')
      : 'Chưa có lịch dạy';
    const classText   = classes[0].length
      ? classes[0].map(c => `${c.name} (${c.type==='1v1'?'1-1':'Nhóm'}, ${c.so_hv} HV)`).join('; ')
      : 'Chưa có lớp';
    const stuText     = students[0].length
      ? students[0].map(s => `${s.name} [${s.class_name}]: có mặt ${s.co_mat}, vắng ${s.vang}/${s.total_sessions} buổi`).join('; ')
      : 'Chưa có học viên';
    const attText     = attendance[0].length
      ? attendance[0].map(a => `${a.name} ${a.date?.toISOString?.()?.slice(0,10)||a.date}: ${a.status}`).join('; ')
      : 'Chưa có điểm danh tháng này';
    const unpaidText  = unpaidStudents[0].length
      ? unpaidStudents[0].map(u => `${u.name} (còn ${fmt(u.amount-u.paid)})`).join('; ')
      : 'Tất cả đã đóng học phí';

    const context = `THÔNG TIN GIÁO VIÊN:
Tên: ${teacher.name} | Chuyên môn: ${teacher.instrument}
LỚP ĐANG DẠY: ${classText}
LỊCH DẠY: ${schedText}
HỌC VIÊN & TIẾN ĐỘ: ${stuText}
ĐIỂM DANH THÁNG NÀY: ${attText}
HỌC PHÍ CHƯA ĐÓNG: ${unpaidText}`;

    const answer = await callAI(
      `Bạn là trợ lý AI hỗ trợ giáo viên tại Ascent Music Center.
Vai trò: giúp giáo viên quản lý lớp học, theo dõi học viên, xem lịch dạy, nhận xét tiến độ học viên.
Chỉ cung cấp thông tin về lớp/HV của giáo viên này, không đề cập dữ liệu của GV khác.
Trả lời thân thiện, chuyên nghiệp bằng tiếng Việt.

${context}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) { handleErr(res, err, 'teacher-chat'); }
});

// ════════════════════════════════════════════════
// ③ AI HỌC VIÊN — thông tin cá nhân của HV đó
// ════════════════════════════════════════════════
router.post('/parent-chat', auth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Thiếu câu hỏi!' });
    const userId = req.user.id;

    const [[stu]] = await db.query(
      'SELECT id, name, instrument, level, total_sessions FROM students WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const studentId = stu?.id;

    let tuitionText  = 'Chưa có dữ liệu học phí';
    let scheduleText = 'Chưa có lịch học';
    let attendText   = 'Chưa có dữ liệu điểm danh';
    let progressText = 'Chưa có dữ liệu tiến độ';

    if (studentId) {
      const [tuition, schedules, [attRow], [progress]] = await Promise.all([
        db.query(
          `SELECT amount, paid, status, month FROM tuition WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
          [studentId]
        ),
        db.query(`
          SELECT c.name AS class_name, sc.day_of_week, sc.time_start, sc.time_end,
            t.name AS teacher_name
          FROM class_students cs
          JOIN classes   c  ON cs.class_id  = c.id
          JOIN schedules sc ON sc.class_id  = c.id
          LEFT JOIN teachers t ON sc.teacher_id = t.id
          WHERE cs.student_id = ? AND sc.status = 'active'
          ORDER BY sc.day_of_week, sc.time_start
        `, [studentId]),
        db.query(`
          SELECT SUM(status='present') AS co_mat,
                 SUM(status='absent')  AS vang,
                 COUNT(*) AS tong
          FROM attendance WHERE student_id = ?
        `, [studentId]),
        db.query(`
          SELECT s.total_sessions,
            COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS da_hoc
          FROM students s
          LEFT JOIN attendance a ON a.student_id = s.id
          WHERE s.id = ?
          GROUP BY s.id, s.total_sessions
        `, [studentId]),
      ]);

      const DAY = { 1:'CN', 2:'T2', 3:'T3', 4:'T4', 5:'T5', 6:'T6', 7:'T7' };
      tuitionText  = tuition[0].length
        ? tuition[0].map(t => `${t.month||''} ${fmt(t.amount)} - ${t.status} (đã trả ${fmt(t.paid)})`).join('; ')
        : tuitionText;
      scheduleText = schedules[0].length
        ? schedules[0].map(s => `${DAY[s.day_of_week]} ${String(s.time_start).slice(0,5)}-${String(s.time_end).slice(0,5)} ${s.class_name} (GV: ${s.teacher_name||'?'})`).join('; ')
        : scheduleText;
      if (attRow[0]?.tong > 0) {
        attendText = `Có mặt ${attRow[0].co_mat}/${attRow[0].tong} buổi, vắng ${attRow[0].vang} buổi`;
      }
      if (progress[0]) {
        const p = progress[0];
        const con_lai = (p.total_sessions||0) - (p.da_hoc||0);
        progressText = `Đã học ${p.da_hoc}/${p.total_sessions||'?'} buổi, còn ${con_lai > 0 ? con_lai : 0} buổi`;
      }
    }

    const answer = await callAI(
      `Bạn là trợ lý AI thân thiện của Ascent Music Center, hỗ trợ học viên và phụ huynh.
Vai trò: giúp xem lịch học, tiến độ khóa học, học phí, điểm danh và trả lời câu hỏi về âm nhạc.
Trả lời nhẹ nhàng, động viên, dễ hiểu bằng tiếng Việt.

Học viên: ${stu?.name || 'không xác định'} | Nhạc cụ: ${stu?.instrument||'?'} | Trình độ: ${stu?.level||'?'}
Lịch học: ${scheduleText}
Tiến độ: ${progressText}
Điểm danh: ${attendText}
Học phí: ${tuitionText}`,
      question
    );

    res.json({ success: true, answer });
  } catch (err) { handleErr(res, err, 'parent-chat'); }
});

// ════════════════════════════════════════════════
// ④ Tạo nhận xét học viên (admin + GV)
// ════════════════════════════════════════════════
router.post('/feedback', auth, role('admin', 'teacher'), async (req, res) => {
  try {
    const { studentName, subject, score, notes, period } = req.body;
    const feedback = await callAI(
      `Bạn là giáo viên âm nhạc chuyên nghiệp tại Ascent Music Center.
Viết nhận xét đánh giá học viên để gửi phụ huynh: tích cực, động viên, 3-4 câu.
Đề cập điểm mạnh và điểm cần cải thiện. Kết thúc bằng lời khích lệ. Chỉ trả về nội dung nhận xét.`,
      `Học viên: ${studentName} | Môn: ${subject} | Điểm: ${score||'N/A'} | Ghi chú: ${notes||'không có'} | Kỳ: ${period||'này'}`
    );
    res.json({ success: true, feedback });
  } catch (err) { handleErr(res, err, 'feedback'); }
});

// ════════════════════════════════════════════════
// ⑤ Phân tích báo cáo (admin)
// ════════════════════════════════════════════════
router.post('/report', auth, role('admin'), async (req, res) => {
  try {
    const [[students]] = await db.query("SELECT COUNT(*) AS n FROM students WHERE status='active'");
    const [[classes]]  = await db.query("SELECT COUNT(*) AS n FROM classes WHERE status='Đang học'");
    const [revenue]    = await db.query(`
      SELECT DATE_FORMAT(created_at, '%m/%Y') AS thang,
             SUM(paid) AS da_thu, SUM(amount - paid) AS con_no
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
      `Bạn là chuyên gia phân tích kinh doanh cho Ascent Music Center.
Phân tích dữ liệu bằng tiếng Việt: nêu xu hướng, điểm tốt, rủi ro và 2-3 đề xuất cụ thể.`,
      `HV: ${students.n} | Lớp: ${classes.n} | Điểm danh: ${attRate?.ti_le||0}%\nDoanh thu: ${revenueText}`,
      1000
    );
    res.json({ success: true, analysis });
  } catch (err) { handleErr(res, err, 'report'); }
});

// ════════════════════════════════════════════════
// ⑥ Soạn thông báo
// ════════════════════════════════════════════════
router.post('/compose', auth, async (req, res) => {
  try {
    const { input, tone, recipient } = req.body;
    const toneMap      = { lich_su:'lịch sự trang trọng', than_thien:'thân thiện gần gũi', ngan_gon:'ngắn gọn súc tích' };
    const recipientMap = { phu_huynh:'phụ huynh', hoc_vien:'học viên', giao_vien:'giáo viên', tat_ca:'tất cả' };
    const text = await callAI(
      `Bạn là trợ lý soạn thông báo cho Ascent Music Center.
Soạn thông báo giọng ${toneMap[tone]||'lịch sự'} gửi đến ${recipientMap[recipient]||'phụ huynh'}.
Chỉ trả về nội dung thông báo.`,
      input
    );
    res.json({ success: true, text });
  } catch (err) { handleErr(res, err, 'compose'); }
});

module.exports = router;