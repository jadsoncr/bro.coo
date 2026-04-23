const mockEmitToTenant = jest.fn();
const mockGetQueues = jest.fn();

jest.mock('../src/realtime/socket', () => ({
  emitToTenant: mockEmitToTenant,
}));

jest.mock('../src/sla/queues', () => ({
  getQueues: mockGetQueues,
}));

const { handleEvent, refreshQueues, notify, EVENT_MAP } = require('../src/attention/loop');

describe('attention loop', () => {
  beforeEach(() => {
    mockEmitToTenant.mockClear();
    mockGetQueues.mockClear();
  });

  describe('handleEvent', () => {
    test('lead_created emits lead:new to tenant room', () => {
      handleEvent({ tenantId: 't1', event: 'lead_created', metadata: { nome: 'João' } });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'lead:new', expect.objectContaining({ event: 'lead_created', nome: 'João' }));
    });

    test('first_response emits lead:updated', () => {
      handleEvent({ tenantId: 't1', event: 'first_response', metadata: {} });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'lead:updated', expect.objectContaining({ event: 'first_response' }));
    });

    test('converted emits lead:converted with caso data', () => {
      handleEvent({ tenantId: 't1', event: 'converted', metadata: { caso: { id: 'c1' } } });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'lead:converted', expect.objectContaining({ caso: { id: 'c1' } }));
    });

    test('lost emits lead:lost with reason', () => {
      handleEvent({ tenantId: 't1', event: 'lost', metadata: { reason: 'preco' } });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'lead:lost', expect.objectContaining({ reason: 'preco' }));
    });

    test('abandoned emits lead:updated', () => {
      handleEvent({ tenantId: 't1', event: 'abandoned', metadata: { step: 'menu_1' } });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'lead:updated', expect.objectContaining({ event: 'abandoned' }));
    });

    test('payment_received emits caso:updated', () => {
      handleEvent({ tenantId: 't1', event: 'payment_received', metadata: { valor: 1000 } });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'caso:updated', expect.objectContaining({ event: 'payment_received' }));
    });

    test('ignores null/missing event', () => {
      handleEvent(null);
      handleEvent({});
      handleEvent({ tenantId: 't1' });
      expect(mockEmitToTenant).not.toHaveBeenCalled();
    });

    test('ignores unknown event type', () => {
      handleEvent({ tenantId: 't1', event: 'unknown_event', metadata: {} });
      expect(mockEmitToTenant).not.toHaveBeenCalled();
    });
  });

  describe('refreshQueues', () => {
    test('fetches queues and emits queues:updated', async () => {
      const queues = [{ name: 'Leads sem resposta', count: 2, items: [] }];
      mockGetQueues.mockResolvedValue(queues);

      await refreshQueues('t1');

      expect(mockGetQueues).toHaveBeenCalledWith('t1');
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'queues:updated', queues);
    });

    test('does nothing for null tenantId', async () => {
      await refreshQueues(null);
      expect(mockGetQueues).not.toHaveBeenCalled();
    });
  });

  describe('notify', () => {
    test('emits event to tenant room', () => {
      notify('t1', 'custom:event', { foo: 'bar' });
      expect(mockEmitToTenant).toHaveBeenCalledWith('t1', 'custom:event', { foo: 'bar' });
    });

    test('does nothing for missing tenantId or event', () => {
      notify(null, 'event', {});
      notify('t1', null, {});
      expect(mockEmitToTenant).not.toHaveBeenCalled();
    });
  });

  describe('EVENT_MAP', () => {
    test('maps all expected event types', () => {
      expect(EVENT_MAP.lead_created).toBe('lead:new');
      expect(EVENT_MAP.first_response).toBe('lead:updated');
      expect(EVENT_MAP.converted).toBe('lead:converted');
      expect(EVENT_MAP.lost).toBe('lead:lost');
      expect(EVENT_MAP.abandoned).toBe('lead:updated');
      expect(EVENT_MAP.payment_received).toBe('caso:updated');
    });
  });
});
