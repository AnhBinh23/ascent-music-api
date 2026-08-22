
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
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
    },
    pingInterval: 25000,
    pingTimeout:  60000,
  });

  // ─── Auth middleware ───
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Chưa đăng nhập'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // { id, role, name, ... }
      next();
    } catch {
      next(new Error('Token không hợp lệ'));
    }
  });

  // ─── Connection handler ───
  io.on('connection', (socket) => {
    const { id, role, name } = socket.user;
    console.log(`🔌 Socket connected: ${name} (${role}) [${socket.id}]`);

    // Join role room
    socket.join(`role:${role}`);
    // Join personal room
    socket.join(`user:${id}`);

    // Heartbeat / presence
    socket.on('ping', () => socket.emit('pong'));

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${name} (${role}) — ${reason}`);
    });
  });

  console.log('🔌 Socket.IO initialized');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO chưa được khởi tạo!');
  return io;
}

// ─── Emit helpers ───

/**
 * Broadcast to admin & staff rooms
 */
function emitToAdmins(event, data) {
  if (!io) return;
  io.to('role:admin').to('role:staff').emit(event, data);
}

/**
 * Broadcast to all teachers
 */
function emitToTeachers(event, data) {
  if (!io) return;
  io.to('role:teacher').emit(event, data);
}

/**
 * Send to a specific user
 */
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Broadcast to everyone (all connected clients)
 */
function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}

module.exports = {
  initSocket,
  getIO,
  emitToAdmins,
  emitToTeachers,
  emitToUser,
  emitToAll,
};