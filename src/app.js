const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/teachers',   require('./routes/teachers'));
app.use('/api/classes',    require('./routes/classes'));
app.use('/api/schedules',  require('./routes/schedules'));
app.use('/api/tuition',    require('./routes/tuition'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/checkin',    require('./routes/checkin'));
app.use('/api/rooms', require('./routes/rooms'));
app.get('/', (req, res) => res.json({ message: '🎵 Ascent Music API đang chạy!' }));

app.use((req, res) => res.status(404).json({ message: 'Route không tồn tại' }));

module.exports = app;