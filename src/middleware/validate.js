const { body, param, query, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => e.msg);
    return res.status(400).json({ success: false, message: messages[0], errors: messages });
  }
  next();
};

const trimStr = (field, label, { min = 1, max = 255 } = {}) =>
  body(field).trim().notEmpty().withMessage(`${label} không được để trống`)
    .isLength({ max }).withMessage(`${label} tối đa ${max} ký tự`);

const optionalTrimStr = (field, label, { max = 255 } = {}) =>
  body(field).optional({ values: 'falsy' }).trim()
    .isLength({ max }).withMessage(`${label} tối đa ${max} ký tự`);

const login = [
  body('email').trim().isEmail().withMessage('Email không hợp lệ'),
  body('password').notEmpty().withMessage('Mật khẩu không được để trống'),
  handleValidation,
];

const register = [
  trimStr('name', 'Họ tên', { max: 100 }),
  body('email').trim().isEmail().withMessage('Email không hợp lệ'),
  body('phone').optional().trim().matches(/^[0-9]{8,15}$/).withMessage('SĐT không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
  body('role').optional().isIn(['teacher', 'student']).withMessage('Role không hợp lệ'),
  handleValidation,
];

const changePassword = [
  body('currentPassword').notEmpty().withMessage('Thiếu mật khẩu hiện tại'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới tối thiểu 6 ký tự'),
  handleValidation,
];

const createAccount = [
  body('link_id').notEmpty().withMessage('Thiếu link_id'),
  body('link_type').isIn(['teacher', 'student']).withMessage('link_type phải là teacher hoặc student'),
  body('email').trim().isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
  handleValidation,
];

const resetPassword = [
  body('user_id').notEmpty().withMessage('Thiếu user_id'),
  body('new_password').isLength({ min: 6 }).withMessage('Mật khẩu tối thiểu 6 ký tự'),
  handleValidation,
];

const studentCreate = [
  trimStr('name', 'Tên học viên', { max: 100 }),
  body('dob').optional({ values: 'falsy' }).isISO8601().withMessage('Ngày sinh không hợp lệ'),
  body('gender').optional().isIn(['Nam', 'Nữ']).withMessage('Giới tính không hợp lệ'),
  body('phone').optional().trim().matches(/^[0-9]{8,15}$/).withMessage('SĐT không hợp lệ'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Email không hợp lệ'),
  optionalTrimStr('instrument', 'Nhạc cụ', { max: 50 }),
  body('level').optional().isIn(['Sơ cấp', 'Trung cấp', 'Nâng cao']).withMessage('Trình độ không hợp lệ'),
  body('total_sessions').optional().isInt({ min: 0 }).withMessage('Tổng buổi phải >= 0'),
  handleValidation,
];

const teacherCreate = [
  trimStr('name', 'Tên giáo viên', { max: 100 }),
  body('dob').optional({ values: 'falsy' }).isISO8601().withMessage('Ngày sinh không hợp lệ'),
  body('gender').optional().isIn(['Nam', 'Nữ']).withMessage('Giới tính không hợp lệ'),
  body('phone').optional().trim().matches(/^[0-9]{8,15}$/).withMessage('SĐT không hợp lệ'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Email không hợp lệ'),
  body('salary_type').optional().isIn(['Theo buổi', 'Theo giờ', 'Theo tháng']).withMessage('Loại lương không hợp lệ'),
  body('salary_amount').optional().isFloat({ min: 0 }).withMessage('Lương phải >= 0'),
  handleValidation,
];

const classCreate = [
  trimStr('name', 'Tên lớp', { max: 100 }),
  body('type').optional().isIn(['1v1', 'group']).withMessage('Loại lớp phải là 1v1 hoặc group'),
  body('max_students').optional().isInt({ min: 1 }).withMessage('Sĩ số tối thiểu 1'),
  body('tuition_fee').optional().isFloat({ min: 0 }).withMessage('Học phí phải >= 0'),
  body('teacher_salary').optional().isFloat({ min: 0 }).withMessage('Lương GV phải >= 0'),
  body('start_date').optional({ values: 'falsy' }).isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
  body('end_date').optional({ values: 'falsy' }).isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
  handleValidation,
];

const scheduleCreate = [
  body('class_id').notEmpty().withMessage('Thiếu lớp học'),
  body('day_of_week').isInt({ min: 1, max: 7 }).withMessage('Thứ phải từ 1-7'),
  body('time_start').matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Giờ bắt đầu không hợp lệ'),
  body('time_end').matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Giờ kết thúc không hợp lệ'),
  handleValidation,
];

const tuitionCreate = [
  body('student_id').notEmpty().withMessage('Thiếu học viên'),
  body('amount').isFloat({ min: 0 }).withMessage('Số tiền phải >= 0'),
  body('paid').optional().isFloat({ min: 0 }).withMessage('Số tiền đã trả phải >= 0'),
  handleValidation,
];

const attendanceSave = [
  body('attendanceList').isArray({ min: 1 }).withMessage('Danh sách điểm danh trống'),
  body('attendanceList.*.student_id').notEmpty().withMessage('Thiếu student_id'),
  body('attendanceList.*.class_id').notEmpty().withMessage('Thiếu class_id'),
  body('attendanceList.*.date').isISO8601().withMessage('Ngày không hợp lệ'),
  body('attendanceList.*.status').isIn(['present', 'absent', 'late', 'excused']).withMessage('Trạng thái không hợp lệ'),
  handleValidation,
];

const checkinCreate = [
  body('class_id').notEmpty().withMessage('Thiếu lớp học'),
  body('date').isISO8601().withMessage('Ngày không hợp lệ'),
  body('time').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Giờ không hợp lệ'),
  handleValidation,
];

const notifSend = [
  trimStr('title', 'Tiêu đề', { max: 200 }),
  body('message').trim().notEmpty().withMessage('Nội dung không được để trống'),
  body('recipient').isIn(['all', 'students', 'teachers', 'specific']).withMessage('Nhóm nhận không hợp lệ'),
  handleValidation,
];

const lessonLogCreate = [
  body('class_id').notEmpty().withMessage('Thiếu lớp học'),
  body('date').isISO8601().withMessage('Ngày không hợp lệ'),
  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Đánh giá từ 1-5'),
  handleValidation,
];

const invoiceCreate = [
  body('student_id').notEmpty().withMessage('Thiếu học viên'),
  body('total_fee').isFloat({ min: 0 }).withMessage('Tổng phí phải >= 0'),
  handleValidation,
];

const messageSend = [
  body('to_id').notEmpty().withMessage('Thiếu người nhận'),
  body('message').trim().notEmpty().withMessage('Tin nhắn không được để trống')
    .isLength({ max: 2000 }).withMessage('Tin nhắn tối đa 2000 ký tự'),
  handleValidation,
];

const aiQuestion = [
  body('question').trim().notEmpty().withMessage('Thiếu câu hỏi')
    .isLength({ max: 1000 }).withMessage('Câu hỏi tối đa 1000 ký tự'),
  handleValidation,
];

const trialCreate = [
  trimStr('name', 'Họ tên', { max: 100 }),
  body('phone').trim().matches(/^[0-9]{8,15}$/).withMessage('SĐT không hợp lệ'),
  optionalTrimStr('instrument', 'Nhạc cụ', { max: 50 }),
  handleValidation,
];

const roomCreate = [
  trimStr('name', 'Tên phòng', { max: 50 }),
  body('capacity').optional().isInt({ min: 1 }).withMessage('Sức chứa tối thiểu 1'),
  handleValidation,
];

const instrumentCreate = [
  trimStr('name', 'Tên nhạc cụ', { max: 100 }),
  handleValidation,
];

module.exports = {
  handleValidation,
  auth: { login, register, changePassword, createAccount, resetPassword },
  student: { create: studentCreate, update: studentCreate },
  teacher: { create: teacherCreate, update: teacherCreate },
  class: { create: classCreate, update: classCreate },
  schedule: { create: scheduleCreate },
  tuition: { create: tuitionCreate },
  attendance: { save: attendanceSave },
  checkin: { create: checkinCreate },
  notification: { send: notifSend },
  lessonLog: { create: lessonLogCreate },
  invoice: { create: invoiceCreate },
  message: { send: messageSend },
  ai: { question: aiQuestion },
  trial: { create: trialCreate },
  room: { create: roomCreate },
  instrument: { create: instrumentCreate },
};
