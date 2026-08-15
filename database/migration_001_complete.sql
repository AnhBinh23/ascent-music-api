USE ascent_music;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 0 AFTER note,
  ADD COLUMN IF NOT EXISTS current_course INT DEFAULT 1 AFTER total_sessions,
  ADD COLUMN IF NOT EXISTS nickname       VARCHAR(50)   AFTER name;

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teacher_salary         DECIMAL(15,0) DEFAULT 0 AFTER note,
  ADD COLUMN IF NOT EXISTS teacher_salary_partial  DECIMAL(15,0) DEFAULT 0 AFTER teacher_salary;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS course_number INT DEFAULT 1 AFTER note;
ALTER TABLE attendance
  ADD UNIQUE INDEX uq_attendance (student_id, class_id, date);

ALTER TABLE class_students
  ADD COLUMN IF NOT EXISTS course_number INT DEFAULT 1 AFTER joined_at;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS show_banner    TINYINT(1) DEFAULT 0 AFTER read_by,
  ADD COLUMN IF NOT EXISTS banner_type    VARCHAR(20) DEFAULT 'info' AFTER show_banner,
  ADD COLUMN IF NOT EXISTS banner_start   DATE AFTER banner_type,
  ADD COLUMN IF NOT EXISTS banner_end     DATE AFTER banner_start,
  ADD COLUMN IF NOT EXISTS banner_active  TINYINT(1) DEFAULT 1 AFTER banner_end;

ALTER TABLE tuition
  ADD COLUMN IF NOT EXISTS class_id       VARCHAR(36) REFERENCES classes(id) AFTER student_id,
  ADD COLUMN IF NOT EXISTS sessions       INT DEFAULT 0 AFTER month,
  ADD COLUMN IF NOT EXISTS course_number  INT DEFAULT 1 AFTER sessions;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP AFTER status,
  ADD COLUMN IF NOT EXISTS zalo_id             VARCHAR(100) AFTER password_updated_at;

CREATE TABLE IF NOT EXISTS instruments (
  id            VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(50)  DEFAULT 'Piano',
  room_id       VARCHAR(36)  REFERENCES rooms(id),
  status        VARCHAR(30)  DEFAULT 'Tốt',
  purchase_date DATE,
  note          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id      VARCHAR(36) NOT NULL,
  subscription JSON NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  from_id    VARCHAR(36)  NOT NULL REFERENCES users(id),
  to_id      VARCHAR(36)  NOT NULL REFERENCES users(id),
  message    TEXT NOT NULL,
  is_read    TINYINT(1)   DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  teacher_id VARCHAR(36)  NOT NULL REFERENCES teachers(id),
  month      VARCHAR(7)   NOT NULL,
  amount     DECIMAL(15,0) DEFAULT 0,
  status     VARCHAR(20)  DEFAULT 'paid',
  note       TEXT,
  paid_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, month)
);

CREATE TABLE IF NOT EXISTS schedule_overrides (
  id              VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  schedule_id     VARCHAR(36) REFERENCES schedules(id),
  teacher_id      VARCHAR(36) REFERENCES teachers(id),
  original_date   DATE NOT NULL,
  new_day_of_week TINYINT,
  new_time_start  TIME,
  new_time_end    TIME,
  room_id         VARCHAR(36) REFERENCES rooms(id),
  status          VARCHAR(20) DEFAULT 'rescheduled',
  note            TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, original_date)
);

CREATE TABLE IF NOT EXISTS renewal_notes (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  student_id VARCHAR(36) NOT NULL REFERENCES students(id),
  confirmed  TINYINT(1)  DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(student_id)
);

CREATE TABLE IF NOT EXISTS makeup_sessions (
  id                VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  student_id        VARCHAR(36) NOT NULL REFERENCES students(id),
  class_id          VARCHAR(36) NOT NULL REFERENCES classes(id),
  teacher_id        VARCHAR(36) REFERENCES teachers(id),
  original_date     DATE,
  makeup_date       DATE NOT NULL,
  makeup_time_start TIME NOT NULL,
  makeup_time_end   TIME,
  room_id           VARCHAR(36) REFERENCES rooms(id),
  status            ENUM('pending','confirmed','cancelled','completed') DEFAULT 'pending',
  note              TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trial_registrations (
  id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name       VARCHAR(100) NOT NULL,
  phone      VARCHAR(20),
  instrument VARCHAR(50),
  time       VARCHAR(100),
  age        VARCHAR(20),
  note       TEXT,
  status     ENUM('pending','contacted','converted','cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_user_id  ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_status   ON students(status);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id  ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_status   ON teachers(status);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_room_id    ON classes(room_id);
CREATE INDEX IF NOT EXISTS idx_classes_status     ON classes(status);
CREATE INDEX IF NOT EXISTS idx_cs_student_id ON class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_cs_class_id   ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_sched_class_id    ON schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_sched_teacher_id  ON schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sched_day_status  ON schedules(day_of_week, status);
CREATE INDEX IF NOT EXISTS idx_att_student_id    ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_class_id      ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_att_date          ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_att_course        ON attendance(student_id, course_number);
CREATE INDEX IF NOT EXISTS idx_tuition_student   ON tuition(student_id);
CREATE INDEX IF NOT EXISTS idx_tuition_class     ON tuition(class_id);
CREATE INDEX IF NOT EXISTS idx_tuition_status    ON tuition(status);
CREATE INDEX IF NOT EXISTS idx_tuition_course    ON tuition(student_id, course_number);
CREATE INDEX IF NOT EXISTS idx_checkin_teacher   ON checkin(teacher_id);
CREATE INDEX IF NOT EXISTS idx_checkin_class     ON checkin(class_id);
CREATE INDEX IF NOT EXISTS idx_checkin_date      ON checkin(date);
CREATE INDEX IF NOT EXISTS idx_invoices_student  ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_teacher  ON invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_notif_sent_by     ON notifications(sent_by);
CREATE INDEX IF NOT EXISTS idx_notif_banner      ON notifications(show_banner, banner_active);
CREATE INDEX IF NOT EXISTS idx_ll_class_id       ON lesson_logs(class_id);
CREATE INDEX IF NOT EXISTS idx_ll_teacher_id     ON lesson_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ll_date           ON lesson_logs(date);
CREATE INDEX IF NOT EXISTS idx_mat_class_id      ON materials(class_id);
CREATE INDEX IF NOT EXISTS idx_mat_teacher_id    ON materials(teacher_id);
CREATE INDEX IF NOT EXISTS idx_msg_from          ON messages(from_id);
CREATE INDEX IF NOT EXISTS idx_msg_to            ON messages(to_id);
CREATE INDEX IF NOT EXISTS idx_msg_to_read       ON messages(to_id, is_read);
CREATE INDEX IF NOT EXISTS idx_instr_room        ON instruments(room_id);
CREATE INDEX IF NOT EXISTS idx_makeup_student    ON makeup_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_makeup_teacher    ON makeup_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_makeup_status     ON makeup_sessions(status);
CREATE INDEX IF NOT EXISTS idx_salary_teacher    ON salary_payments(teacher_id);
