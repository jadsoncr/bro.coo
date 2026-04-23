const mockCreate = jest.fn(async ({ data }) => ({ id: 'event-1', ...data }));

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    event: { create: mockCreate },
  })),
}));

const mockHandleEvent = jest.fn();
jest.mock('../src/attention/loop', () => ({
  handleEvent: mockHandleEvent,
}));

const { EVENTS, recordEvent, safeRecordEvent, sleep } = require('../src/events/service');

describe('events service', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockHandleEvent.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('recordEvent', () => {
    test('persists event with all fields', async () => {
      const event = await recordEvent({
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        event: EVENTS.LEAD_CREATED,
        step: 'start',
        metadata: { origem: 'google' },
      });

      expect(event.event).toBe('lead_created');
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          event: 'lead_created',
          step: 'start',
          metadata: { origem: 'google' },
        },
      });
    });

    test('throws when tenantId is missing', async () => {
      await expect(recordEvent({ event: 'test' })).rejects.toThrow('tenantId');
    });

    test('throws when event is missing', async () => {
      await expect(recordEvent({ tenantId: 't1' })).rejects.toThrow('event');
    });
  });

  describe('EVENTS constants', () => {
    test('includes new SLA and classification event types', () => {
      expect(EVENTS.SLA_WARNING).toBe('sla_warning');
      expect(EVENTS.SLA_RISK).toBe('sla_risk');
      expect(EVENTS.SLA_CRITICAL).toBe('sla_critical');
      expect(EVENTS.SLA_LOST).toBe('sla_lost');
      expect(EVENTS.CLASSIFICATION_CORRECTED).toBe('classification_corrected');
      expect(EVENTS.CLASSIFICATION_FAILED).toBe('classification_failed');
    });

    test('preserves existing event types', () => {
      expect(EVENTS.LEAD_CREATED).toBe('lead_created');
      expect(EVENTS.FIRST_RESPONSE).toBe('first_response');
      expect(EVENTS.CONVERTED).toBe('converted');
      expect(EVENTS.LOST).toBe('lost');
      expect(EVENTS.ABANDONED).toBe('abandoned');
    });
  });

  describe('safeRecordEvent', () => {
    test('records event and triggers attention loop on success', async () => {
      const data = { tenantId: 't1', event: 'lead_created' };
      const result = await safeRecordEvent(data);

      expect(result).toBeTruthy();
      expect(result.event).toBe('lead_created');
      expect(mockHandleEvent).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 't1',
        event: 'lead_created',
        id: 'event-1',
      }));
    });

    test('retries on failure and succeeds on second attempt', async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('db error'))
        .mockResolvedValueOnce({ id: 'event-2', tenantId: 't1', event: 'test' });

      const result = await safeRecordEvent({ tenantId: 't1', event: 'test' });

      expect(result).toBeTruthy();
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    test('returns null and logs DLQ after 4 failures (1 initial + 3 retries)', async () => {
      mockCreate.mockRejectedValue(new Error('persistent error'));

      const result = await safeRecordEvent({ tenantId: 't1', event: 'test' });

      expect(result).toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(4);
      expect(console.error).toHaveBeenCalledWith(
        '[event DLQ]',
        expect.stringContaining('t1'),
        'persistent error'
      );
    });

    test('never throws even on total failure', async () => {
      mockCreate.mockRejectedValue(new Error('crash'));

      const result = await safeRecordEvent({ tenantId: 't1', event: 'test' });
      expect(result).toBeNull();
    });

    test('catches attention loop errors without affecting result', async () => {
      mockCreate.mockImplementation(async ({ data }) => ({ id: 'event-1', ...data }));
      mockHandleEvent.mockImplementation(() => { throw new Error('loop crash'); });

      const result = await safeRecordEvent({ tenantId: 't1', event: 'test' });

      expect(result).toBeTruthy();
      expect(console.error).toHaveBeenCalledWith('[attention loop error]', 'loop crash');
    });
  });

  describe('sleep', () => {
    test('resolves after specified ms', async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });
});
