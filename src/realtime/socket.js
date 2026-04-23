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
    // 1. Try JWT auth first
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        // Lazy require to avoid circular dependency
        const { verifyToken } = require('../auth/service');
        const claims = verifyToken(token);
        socket.userId = claims.userId;
        socket.tenantId = claims.tenantId;
        socket.role = claims.role;
      } catch {
        socket.disconnect(true);
        return;
      }
    } else {
      // 2. Backward compatibility: fall back to tenantId from handshake
      const { tenantId } = socket.handshake.auth;
      if (tenantId) {
        socket.tenantId = tenantId;
      }
    }

    // Auto-join tenant room if tenantId is available
    if (socket.tenantId) {
      socket.join(`tenant:${socket.tenantId}`);
    }

    // Support explicit room joining
    socket.on('join:tenant', () => {
      if (socket.tenantId) {
        socket.join(`tenant:${socket.tenantId}`);
      }
    });

    socket.on('join:operator', () => {
      if (socket.userId) {
        socket.join(`operator:${socket.userId}`);
      }
    });
  });

  return _io;
}

function emitToTenant(tenantId, event, data) {
  if (_io) {
    _io.to(`tenant:${tenantId}`).emit(event, data);
  }
}

function emitToOperator(userId, event, data) {
  if (_io) {
    _io.to(`operator:${userId}`).emit(event, data);
  }
}

function getIo() {
  return _io;
}

module.exports = { initSocket, emitToTenant, emitToOperator, getIo };
