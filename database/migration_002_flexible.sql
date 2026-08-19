USE ascent_music;

-- Thêm cột is_flexible vào bảng classes
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS is_flexible TINYINT(1) DEFAULT 0 AFTER type;

-- Bảng đăng ký buổi linh hoạt
CREATE TABLE IF NOT EXISTS flexible_sessions (
  id               VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  student_id       VARCHAR(36) NOT NULL REFERENCES students(id),
  class_id         VARCHAR(36) NOT NULL REFERENCES classes(id),
  session_date     DATE NOT NULL,
  status           ENUM('registered','attended','absent','cancelled') DEFAULT 'registered',
  note             TEXT,
  attendance_note  TEXT,
  attended_at      TIMESTAMP NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flex_session (student_id, class_id, session_date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_flex_class_date   ON flexible_sessions(class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_flex_student       ON flexible_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_flex_status        ON flexible_sessions(status);