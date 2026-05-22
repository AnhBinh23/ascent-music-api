CREATE DATABASE IF NOT EXISTS ascent_music
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ascent_music;

-- Tài khoản
CREATE TABLE users (
  id          VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','staff','teacher','student') DEFAULT 'student',
  phone       VARCHAR(20),
  status      ENUM('active','inactive') DEFAULT 'active',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Học viên
CREATE TABLE students (
  id           VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  user_id      VARCHAR(36)  REFERENCES users(id),
  name         VARCHAR(100) NOT NULL,
  dob          DATE,
  gender       ENUM('Nam','Nữ'),
  phone        VARCHAR(20),
  email        VARCHAR(100),
  address      TEXT,
  instrument   VARCHAR(50),
  level        ENUM('Sơ cấp','Trung cấp','Nâng cao') DEFAULT 'Sơ cấp',
  parent_name  VARCHAR(100),
  parent_phone VARCHAR(20),
  note         TEXT,
  status       ENUM('active','inactive') DEFAULT 'active',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Giáo viên
CREATE TABLE teachers (
  id             VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  user_id        VARCHAR(36)  REFERENCES users(id),
  name           VARCHAR(100) NOT NULL,
  dob            DATE,
  gender         ENUM('Nam','Nữ'),
  phone          VARCHAR(20),
  email          VARCHAR(100),
  address        TEXT,
  instrument     VARCHAR(50),
  experience     VARCHAR(100),
  salary_type    ENUM('Theo buổi','Theo giờ','Theo tháng') DEFAULT 'Theo buổi',
  salary_amount  DECIMAL(15,0) DEFAULT 0,
  note           TEXT,
  status         ENUM('active','inactive') DEFAULT 'active',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Phòng học
CREATE TABLE rooms (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name       VARCHAR(50)  NOT NULL,
  capacity   INT DEFAULT 2,
  equipment  TEXT,
  status     ENUM('Trống','Đang sử dụng','Bảo trì') DEFAULT 'Trống',
  note       TEXT
);

-- Lớp học
CREATE TABLE classes (
  id           VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name         VARCHAR(100) NOT NULL,
  instrument   VARCHAR(50),
  type         ENUM('1v1','group') DEFAULT '1v1',
  teacher_id   VARCHAR(36)  REFERENCES teachers(id),
  room_id      VARCHAR(36)  REFERENCES rooms(id),
  max_students INT DEFAULT 1,
  level        ENUM('Sơ cấp','Trung cấp','Nâng cao'),
  tuition_fee  DECIMAL(15,0) DEFAULT 0,
  schedule     VARCHAR(200),
  start_date   DATE,
  end_date     DATE,
  status       ENUM('Đang tuyển sinh','Đang học','Đã kết thúc') DEFAULT 'Đang tuyển sinh',
  note         TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Học viên trong lớp
CREATE TABLE class_students (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  class_id   VARCHAR(36) REFERENCES classes(id) ON DELETE CASCADE,
  student_id VARCHAR(36) REFERENCES students(id) ON DELETE CASCADE,
  joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, student_id)
);

-- Lịch học
CREATE TABLE schedules (
  id          VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  class_id    VARCHAR(36) REFERENCES classes(id),
  teacher_id  VARCHAR(36) REFERENCES teachers(id),
  room_id     VARCHAR(36) REFERENCES rooms(id),
  day_of_week TINYINT,
  time_start  TIME,
  time_end    TIME,
  date        DATE,
  type        ENUM('1v1','group') DEFAULT '1v1',
  status      ENUM('active','cancelled','makeup') DEFAULT 'active',
  note        TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Điểm danh
CREATE TABLE attendance (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  class_id   VARCHAR(36) REFERENCES classes(id),
  student_id VARCHAR(36) REFERENCES students(id),
  date       DATE NOT NULL,
  status     ENUM('present','absent','late','excused') DEFAULT 'present',
  note       TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Nhật ký học tập
CREATE TABLE lesson_logs (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  class_id   VARCHAR(36) REFERENCES classes(id),
  teacher_id VARCHAR(36) REFERENCES teachers(id),
  date       DATE NOT NULL,
  content    TEXT,
  skill      TEXT,
  weakness   TEXT,
  progress   TEXT,
  homework   TEXT,
  rating     TINYINT DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Học phí
CREATE TABLE tuition (
  id          VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  student_id  VARCHAR(36) REFERENCES students(id),
  month       VARCHAR(7),
  amount      DECIMAL(15,0) DEFAULT 0,
  paid        DECIMAL(15,0) DEFAULT 0,
  status      ENUM('Đã thanh toán','Chưa thanh toán','Thanh toán 1 phần') DEFAULT 'Chưa thanh toán',
  method      VARCHAR(50),
  paid_date   DATE,
  note        TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hóa đơn đăng ký
CREATE TABLE invoices (
  id                VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  invoice_no        VARCHAR(20)  UNIQUE,
  student_id        VARCHAR(36)  REFERENCES students(id),
  instrument        VARCHAR(50),
  billing_type      ENUM('session','month') DEFAULT 'session',
  sessions          INT DEFAULT 0,
  sessions_per_week INT DEFAULT 2,
  price_per_session DECIMAL(15,0) DEFAULT 0,
  duration          INT DEFAULT 0,
  total_fee         DECIMAL(15,0) DEFAULT 0,
  discount          DECIMAL(15,0) DEFAULT 0,
  start_date        DATE,
  end_date          DATE,
  schedule          VARCHAR(200),
  teacher_id        VARCHAR(36)  REFERENCES teachers(id),
  method            VARCHAR(50),
  status            ENUM('unpaid','paid') DEFAULT 'unpaid',
  paid_date         DATE,
  paid_method       VARCHAR(50),
  paid_note         TEXT,
  note              TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chấm công
CREATE TABLE checkin (
  id            VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  teacher_id    VARCHAR(36) REFERENCES teachers(id),
  class_id      VARCHAR(36) REFERENCES classes(id),
  date          DATE NOT NULL,
  time          TIME,
  salary_earned DECIMAL(15,0) DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Thông báo
CREATE TABLE notifications (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title      VARCHAR(200),
  message    TEXT,
  type       VARCHAR(50),
  recipient  ENUM('all','students','teachers','specific') DEFAULT 'all',
  sent_by    VARCHAR(36) REFERENCES users(id),
  read_by    JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tài liệu
CREATE TABLE materials (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name       VARCHAR(200) NOT NULL,
  type       ENUM('video','pdf','sheet','assignment'),
  class_id   VARCHAR(36) REFERENCES classes(id),
  teacher_id VARCHAR(36) REFERENCES teachers(id),
  url        TEXT,
  mime_type  VARCHAR(100),
  size       VARCHAR(20),
  note       TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tài khoản chờ duyệt
CREATE TABLE pending_accounts (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name       VARCHAR(100),
  email      VARCHAR(100),
  phone      VARCHAR(20),
  role       ENUM('teacher','student'),
  instrument VARCHAR(50),
  password   VARCHAR(255),
  note       TEXT,
  status     ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);