// dashboard/src/lib/socket.js
import { io } from 'socket.io-client';

let _socket = null;

export function connectSocket(apiUrl, tenantId, onLeadNew, onLeadUpdated) {
  if (_socket) return _socket;

  _socket = io(apiUrl || 'http://localhost:3000', {
    auth: { tenantId },
    reconnectionAttempts: 5,
  });

  _socket.on('lead:new', () => onLeadNew?.());
  _socket.on('lead:updated', () => onLeadUpdated?.());
  _socket.on('metrics:update', () => onLeadNew?.());

  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
