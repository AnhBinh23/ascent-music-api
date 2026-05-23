const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://ascent-music-center.netlify.app',
    'https://ascent-music.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

app.get('/', (req, res) => res.json({ message: '🎵 Ascent Music API đang chạy!' }));
app.use((req, res) => res.status(404).json({ message: 'Route không tồn tại' }));

module.exports = app;