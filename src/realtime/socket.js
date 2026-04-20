// src/realtime/socket.js
const { Server } = require('socket.io');

let _io;

function initSocket(httpServer) {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  _io.on('connection', (socket) => {
    const { tenantId } = socket.handshake.auth;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }
  });

  return _io;
}

function emitToTenant(tenantId, event, data) {
  if (_io) {
    _io.to(`tenant:${tenantId}`).emit(event, data);
  }
}

function getIo() {
  return _io;
}

module.exports = { initSocket, emitToTenant, getIo };
