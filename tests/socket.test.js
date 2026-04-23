const mockVerifyToken = jest.fn();

jest.mock('../src/auth/service', () => ({
  verifyToken: mockVerifyToken,
}));

// We need to test initSocket, emitToTenant, emitToOperator
// Mock socket.io Server
const mockTo = jest.fn().mockReturnValue({ emit: jest.fn() });
const mockSocketOn = jest.fn();
const mockSocketJoin = jest.fn();
const mockSocketDisconnect = jest.fn();

let connectionHandler;

const mockIo = {
  on: jest.fn((event, handler) => {
    if (event === 'connection') connectionHandler = handler;
  }),
  to: mockTo,
};

jest.mock('socket.io', () => ({
  Server: jest.fn(() => mockIo),
}));

const { initSocket, emitToTenant, emitToOperator, getIo } = require('../src/realtime/socket');

describe('socket.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTo.mockReturnValue({ emit: jest.fn() });
  });

  test('initSocket creates server and registers connection handler', () => {
    const httpServer = {};
    initSocket(httpServer);
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  describe('connection with JWT token', () => {
    test('valid JWT sets userId, tenantId, role and joins tenant room', () => {
      initSocket({});
      mockVerifyToken.mockReturnValue({ userId: 'u1', tenantId: 't1', role: 'OPERATOR' });

      const socket = {
        handshake: { auth: { token: 'valid-jwt' } },
        join: mockSocketJoin,
        on: mockSocketOn,
        disconnect: mockSocketDisconnect,
      };

      connectionHandler(socket);

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-jwt');
      expect(socket.userId).toBe('u1');
      expect(socket.tenantId).toBe('t1');
      expect(socket.role).toBe('OPERATOR');
      expect(mockSocketJoin).toHaveBeenCalledWith('tenant:t1');
    });

    test('invalid JWT disconnects socket', () => {
      initSocket({});
      mockVerifyToken.mockImplementation(() => { throw new Error('invalid'); });

      const socket = {
        handshake: { auth: { token: 'bad-jwt' } },
        join: mockSocketJoin,
        on: mockSocketOn,
        disconnect: mockSocketDisconnect,
      };

      connectionHandler(socket);

      expect(mockSocketDisconnect).toHaveBeenCalledWith(true);
      expect(mockSocketJoin).not.toHaveBeenCalled();
    });
  });

  describe('backward compatibility (no token)', () => {
    test('falls back to tenantId from handshake auth', () => {
      initSocket({});

      const socket = {
        handshake: { auth: { tenantId: 't2' } },
        join: mockSocketJoin,
        on: mockSocketOn,
        disconnect: mockSocketDisconnect,
      };

      connectionHandler(socket);

      expect(socket.tenantId).toBe('t2');
      expect(mockSocketJoin).toHaveBeenCalledWith('tenant:t2');
    });
  });

  describe('room joining events', () => {
    test('join:tenant joins tenant room', () => {
      initSocket({});

      const handlers = {};
      const socket = {
        handshake: { auth: { tenantId: 't3' } },
        join: mockSocketJoin,
        on: jest.fn((event, handler) => { handlers[event] = handler; }),
        disconnect: mockSocketDisconnect,
      };

      connectionHandler(socket);
      mockSocketJoin.mockClear();

      handlers['join:tenant']();
      expect(mockSocketJoin).toHaveBeenCalledWith('tenant:t3');
    });

    test('join:operator joins operator room when userId is set', () => {
      initSocket({});
      mockVerifyToken.mockReturnValue({ userId: 'u2', tenantId: 't1', role: 'OPERATOR' });

      const handlers = {};
      const socket = {
        handshake: { auth: { token: 'valid' } },
        join: mockSocketJoin,
        on: jest.fn((event, handler) => { handlers[event] = handler; }),
        disconnect: mockSocketDisconnect,
      };

      connectionHandler(socket);
      mockSocketJoin.mockClear();

      handlers['join:operator']();
      expect(mockSocketJoin).toHaveBeenCalledWith('operator:u2');
    });
  });

  describe('emitToTenant', () => {
    test('emits event to tenant room', () => {
      initSocket({});
      const mockEmit = jest.fn();
      mockTo.mockReturnValue({ emit: mockEmit });

      emitToTenant('t1', 'lead:new', { id: 'l1' });

      expect(mockTo).toHaveBeenCalledWith('tenant:t1');
      expect(mockEmit).toHaveBeenCalledWith('lead:new', { id: 'l1' });
    });
  });

  describe('emitToOperator', () => {
    test('emits event to operator room', () => {
      initSocket({});
      const mockEmit = jest.fn();
      mockTo.mockReturnValue({ emit: mockEmit });

      emitToOperator('u1', 'task:assigned', { leadId: 'l1' });

      expect(mockTo).toHaveBeenCalledWith('operator:u1');
      expect(mockEmit).toHaveBeenCalledWith('task:assigned', { leadId: 'l1' });
    });
  });

  describe('getIo', () => {
    test('returns io instance after init', () => {
      initSocket({});
      expect(getIo()).toBe(mockIo);
    });
  });
});
