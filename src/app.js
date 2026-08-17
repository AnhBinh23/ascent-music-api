const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const cron         = require('node-cron');
const errorHandler = require('./middleware/errorHandler');
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
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/api/guest-assignments', require('./routes/guestAssignments'));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/group-salary',    require('./routes/groupSalary'));
app.use('/api/auth',             require('./routes/auth'));
app.use('/api/students',         require('./routes/students'));
app.use('/api/teachers',         require('./routes/teachers'));
app.use('/api/classes',          require('./routes/classes'));
app.use('/api/schedules',        require('./routes/schedules'));
app.use('/api/tuition',          require('./routes/tuition'));
app.use('/api/invoices',         require('./routes/invoices'));
app.use('/api/attendance',       require('./routes/attendance'));
app.use('/api/checkin',          require('./routes/checkin'));
app.use('/api/rooms',            require('./routes/rooms'));
app.use('/api/instruments',      require('./routes/instruments'));
app.use('/api/notifications',    require('./routes/notifications'));
app.use('/api/lesson-logs',      require('./routes/lessonLogs'));
app.use('/api/materials',        require('./routes/materials'));
app.use('/api/upload',           require('./routes/upload'));
app.use('/api/trials',           require('./routes/trials'));
app.use('/api/messages',         require('./routes/messages'));
app.use('/api/push',             require('./routes/push').router);
app.use('/api/ai',               require('./routes/ai'));
app.use('/api/salary',           require('./routes/salaryPayments'));
app.use('/api/schedule-overrides', require('./routes/scheduleOverrides'));
app.use('/api/import', require('./routes/importExcel'));
app.use('/api/makeup', require('./routes/makeup'));
app.use('/api/flexible-sessions', require('./routes/flexibleSessions'));
const { remindUpcomingClasses, checkCourseEnding } = require('./routes/push');
cron.schedule('* * * * *', async () => {
  try {
    const sent = await remindUpcomingClasses();
    if (sent > 0) console.log(`⏰ Đã nhắc ${sent} buổi học sắp tới`);
  } catch (e) {
    console.error('Cron remind error:', e.message);
  }
}, { timezone: 'Asia/Ho_Chi_Minh' });

cron.schedule('0 8 * * *', async () => {
  try {
    const sent = await checkCourseEnding();
    if (sent > 0) console.log(`📋 Đã thông báo ${sent} HV sắp hết khóa`);
  } catch (e) {
    console.error('Cron course-ending error:', e.message);
  }
}, { timezone: 'Asia/Ho_Chi_Minh' });

app.get('/', (req, res) => res.json({ message: '🎵 Ascent Music API đang chạy!' }));
app.use((req, res) => res.status(404).json({ success: false, message: 'Route không tồn tại' }));
app.use(errorHandler);

module.exports = app;