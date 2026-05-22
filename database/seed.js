const bcrypt = require('bcryptjs');
const db     = require('../src/models/db');
require('dotenv').config();

const seed = async () => {
  try {
    const hash = await bcrypt.hash('123456', 10);

    // Users
    await db.query('DELETE FROM users');
    await db.query(`
      INSERT INTO users (id, name, email, password, role, phone) VALUES
      ('admin-001',   'Nguyễn Văn Admin',   'admin@ascentmusic.vn', ?, 'admin',   '0901234567'),
      ('staff-001',   'Trần Thị Nhân Viên', 'nv@ascentmusic.vn',    ?, 'staff',   '0912345678'),
      ('teacher-001', 'Nguyễn Thị Mai',     'gv@ascentmusic.vn',    ?, 'teacher', '0923456789'),
      ('student-001', 'Nguyễn Văn An',      'hv@ascentmusic.vn',    ?, 'student', '0934567890')
    `, [hash, hash, hash, hash]);
    console.log('✅ Seed users thành công!');

    // Phòng học
    await db.query('DELETE FROM rooms');
    await db.query(`
      INSERT INTO rooms (id, name, capacity, equipment) VALUES
      ('room-001', 'Phòng 1', 2, 'Đàn Piano, Ghế'),
      ('room-002', 'Phòng 2', 4, 'Đàn Guitar, Amplifier'),
      ('room-003', 'Phòng 3', 2, 'Đàn Violin'),
      ('room-004', 'Phòng 4', 6, 'Micro, Loa')
    `);
    console.log('✅ Seed phòng học thành công!');

    // Giáo viên
    await db.query('DELETE FROM teachers');
    await db.query(`
    INSERT INTO teachers (id, user_id, name, phone, email, instrument, experience, salary_type, salary_amount, status) VALUES
    ('gv-001', 'teacher-001', 'Nguyễn Thị Mai',  '0923456789', 'mai@ascentmusic.vn',   'Piano',      '5 năm', 'Theo buổi', 200000, 'active'),
    ('gv-002', NULL,          'Trần Văn Hùng',   '0934567890', 'hung@ascentmusic.vn',  'Guitar',     '3 năm', 'Theo buổi', 180000, 'active'),
    ('gv-003', NULL,          'Lê Thị Hoa',      '0945678901', 'hoa@ascentmusic.vn',   'Violin',     '7 năm', 'Theo buổi', 220000, 'active'),
    ('gv-004', NULL,          'Phạm Minh Tuấn',  '0956789012', 'tuan@ascentmusic.vn',  'Thanh nhạc', '4 năm', 'Theo buổi', 190000, 'active')
    `);

// Học viên — cập nhật phone khớp với user
await db.query('DELETE FROM students');
await db.query(`
  INSERT INTO students (id, user_id, name, dob, gender, phone, email, instrument, level, parent_name, status) VALUES
  ('hv-001', 'student-001', 'Nguyễn Văn An',  '2010-05-12', 'Nam', '0934567890', 'hv@ascentmusic.vn', 'Piano',      'Sơ cấp',   'Nguyễn Thị B', 'active'),
  ('hv-002', NULL,          'Trần Thị Bình',  '2008-09-20', 'Nữ',  '0912345678', 'binh@gmail.com',    'Guitar',     'Trung cấp','Trần Văn C',   'active'),
  ('hv-003', NULL,          'Lê Minh Châu',   '2012-03-08', 'Nam', '0923456789', 'chau@gmail.com',    'Violin',     'Sơ cấp',   'Lê Thị D',    'active'),
  ('hv-004', NULL,          'Hoàng Văn Em',   '2011-07-22', 'Nam', '0945678901', 'em@gmail.com',      'Piano',      'Trung cấp','Hoàng Thị F', 'active'),
  ('hv-005', NULL,          'Phạm Thị Dung',  '2005-11-15', 'Nữ',  '0956789012', 'dung@gmail.com',    'Thanh nhạc', 'Nâng cao', 'Phạm Văn G',  'active')
`);
    console.log('✅ Seed giáo viên thành công!');

    // Học viên
    await db.query('DELETE FROM students');
    await db.query(`
      INSERT INTO students (id, name, dob, gender, phone, email, instrument, level, parent_name, status) VALUES
      ('hv-001', 'Nguyễn Văn An',  '2010-05-12', 'Nam', '0901234567', 'an@gmail.com',   'Piano',      'Sơ cấp',   'Nguyễn Thị B', 'active'),
      ('hv-002', 'Trần Thị Bình',  '2008-09-20', 'Nữ',  '0912345678', 'binh@gmail.com', 'Guitar',     'Trung cấp','Trần Văn C',   'active'),
      ('hv-003', 'Lê Minh Châu',   '2012-03-08', 'Nam', '0923456789', 'chau@gmail.com', 'Violin',     'Sơ cấp',   'Lê Thị D',    'active'),
      ('hv-004', 'Hoàng Văn Em',   '2011-07-22', 'Nam', '0945678901', 'em@gmail.com',   'Piano',      'Trung cấp','Hoàng Thị F', 'active'),
      ('hv-005', 'Phạm Thị Dung',  '2005-11-15', 'Nữ',  '0934567890', 'dung@gmail.com', 'Thanh nhạc', 'Nâng cao', 'Phạm Văn G',  'active')
    `);
    console.log('✅ Seed học viên thành công!');

    // Lớp học
    await db.query('DELETE FROM class_students');
    await db.query('DELETE FROM classes');
    await db.query(`
      INSERT INTO classes (id, name, instrument, type, teacher_id, room_id, level, tuition_fee, schedule, start_date, status) VALUES
      ('lh-001', 'Piano cơ bản 01',  'Piano',      '1v1',   'gv-001', 'room-001', 'Sơ cấp',   800000, 'T2,T4 - 08:00-09:00', '2025-01-06', 'Đang học'),
      ('lh-002', 'Guitar nhóm 01',   'Guitar',     'group', 'gv-002', 'room-002', 'Sơ cấp',   600000, 'T3,T5 - 10:00-11:00', '2025-01-07', 'Đang học'),
      ('lh-003', 'Violin cơ bản 01', 'Violin',     '1v1',   'gv-003', 'room-003', 'Sơ cấp',   850000, 'T2,T4 - 14:00-15:00', '2025-01-06', 'Đang học'),
      ('lh-004', 'Thanh nhạc 01',    'Thanh nhạc', '1v1',   'gv-004', 'room-004', 'Trung cấp',750000, 'T6,T7 - 09:00-10:00', '2025-01-10', 'Đang học')
    `);
    console.log('✅ Seed lớp học thành công!');

    // Học viên trong lớp
    await db.query(`
      INSERT INTO class_students (class_id, student_id) VALUES
      ('lh-001', 'hv-001'),
      ('lh-001', 'hv-004'),
      ('lh-002', 'hv-002'),
      ('lh-002', 'hv-003'),
      ('lh-003', 'hv-003'),
      ('lh-004', 'hv-005')
    `);
    console.log('✅ Seed học viên vào lớp thành công!');

    // Lịch học
    await db.query('DELETE FROM schedules');
    await db.query(`
      INSERT INTO schedules (class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, status) VALUES
      ('lh-001', 'gv-001', 'room-001', 2, '08:00', '09:00', '1v1',   'active'),
      ('lh-001', 'gv-001', 'room-001', 4, '08:00', '09:00', '1v1',   'active'),
      ('lh-002', 'gv-002', 'room-002', 3, '10:00', '11:00', 'group', 'active'),
      ('lh-002', 'gv-002', 'room-002', 5, '10:00', '11:00', 'group', 'active'),
      ('lh-003', 'gv-003', 'room-003', 2, '14:00', '15:00', '1v1',   'active'),
      ('lh-004', 'gv-004', 'room-004', 6, '09:00', '10:00', '1v1',   'active')
    `);
    console.log('✅ Seed lịch học thành công!');

    console.log('🎉 Seed toàn bộ dữ liệu thành công!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi seed:', err.message);
    process.exit(1);
  }
};

seed();