const bcrypt = require('bcryptjs');
const db     = require('../src/models/db');
require('dotenv').config();

const seed = async () => {
  try {
    const hash = await bcrypt.hash('123456', 10);

    await db.query(`DELETE FROM users`);

    await db.query(`
      INSERT INTO users (id, name, email, password, role, phone) VALUES
      ('admin-001',   'Nguyễn Văn Admin',   'admin@ascentmusic.vn', ?, 'admin',   '0901234567'),
      ('staff-001',   'Trần Thị Nhân Viên', 'nv@ascentmusic.vn',    ?, 'staff',   '0912345678'),
      ('teacher-001', 'Nguyễn Thị Mai',     'gv@ascentmusic.vn',    ?, 'teacher', '0923456789'),
      ('student-001', 'Nguyễn Văn An',      'hv@ascentmusic.vn',    ?, 'student', '0934567890')
    `, [hash, hash, hash, hash]);

    console.log('✅ Seed dữ liệu thành công!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi seed:', err.message);
    process.exit(1);
  }
};

seed();