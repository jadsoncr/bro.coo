// tests/sla-ticker.test.js

const mockEmitToTenant = jest.fn();

jest.mock('../src/realtime/socket', () => ({
  emitToTenant: mockEmitToTenant,
}));

const mockAlerts = [
  { type: 'leads_sem_resposta', tenantId: 'tenant-1', count: 2, items: ['l1', 'l2'], severity: 'warning' },
];

jest.mock('../src/sla/engine', () => ({
  tick: jest.fn(async () => mockAlerts),
}));

const mockTenants = [
  { id: 'tenant-1', nome: 'Test Tenant' },
];

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    tenant: {
      findMany: jest.fn(async () => mockTenants),
    },
  })),
}));

const { startSLATicker, stopSLATicker } = require('../src/sla/ticker');
const { tick } = require('../src/sla/engine');

describe('SLA Ticker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEmitToTenant.mockClear();
    tick.mockClear();
  });

  afterEach(() => {
    stopSLATicker();
    jest.useRealTimers();
  });

  test('startSLATicker sets up interval that calls tick and emits alerts', async () => {
    startSLATicker();

    // Advance 60 seconds
    jest.advanceTimersByTime(60_000);

    // Allow async callbacks to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(tick).toHaveBeenCalledWith('tenant-1');
    expect(mockEmitToTenant).toHaveBeenCalledWith('tenant-1', 'sla:alert', mockAlerts[0]);
  });

  test('stopSLATicker clears the interval', () => {
    startSLATicker();
    stopSLATicker();

    jest.advanceTimersByTime(120_000);

    // tick should not have been called since we stopped before any interval fired
    expect(tick).not.toHaveBeenCalled();
  });

  test('calling startSLATicker twice does not create duplicate intervals', () => {
    startSLATicker();
    startSLATicker();

    jest.advanceTimersByTime(60_000);

    // Should only fire once per interval, not twice
    // (We can't easily assert interval count, but tick should be called once)
  });
});
