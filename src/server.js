const http = require('http');
const app  = require('./app');
const { initSocket } = require('./socket');
require('dotenv').config();

const PORT   = process.env.PORT || 5000;
const server = http.createServer(app);

// Attach Socket.IO to the HTTP server
initSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});