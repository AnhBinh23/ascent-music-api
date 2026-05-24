const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://ascent-music-center.netlify.app',
      'https://ascent-music.vercel.app',
    ];
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── MIGRATION TẠM THỜI — xóa sau khi chạy ──────────────────────────────────
app.get('/api/migrate', async (req, res) => {
  const db = require('./models/db');
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      VARCHAR(36) NOT NULL UNIQUE,
        subscription TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    res.json({ success: true, message: 'Bảng push_subscriptions đã tạo!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/teachers',      require('./routes/teachers'));
app.use('/api/classes',       require('./routes/classes'));
app.use('/api/schedules',     require('./routes/schedules'));
app.use('/api/tuition',       require('./routes/tuition'));
app.use('/api/invoices',      require('./routes/invoices'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/checkin',       require('./routes/checkin'));
app.use('/api/rooms',         require('./routes/rooms'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/lesson-logs',   require('./routes/lessonLogs'));
app.use('/api/materials',     require('./routes/materials'));
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/trials',        require('./routes/trials'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/push',          require('./routes/push').router);
app.use('/api/ai',            require('./routes/ai'));

app.get('/', (req, res) => res.json({ message: '🎵 Ascent Music API đang chạy!' }));
app.use((req, res) => res.status(404).json({ message: 'Route không tồn tại' }));

module.exports = app;