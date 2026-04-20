const mockCreate = jest.fn(async ({ data }) => ({ id: 'event-1', ...data }));

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    event: { create: mockCreate },
  })),
}));

const { EVENTS, recordEvent } = require('../src/events/service');

describe('events service', () => {
  beforeEach(() => mockCreate.mockClear());

  test('recordEvent persiste evento obrigatório', async () => {
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
});
