const mockCasoFindFirst = jest.fn();
const mockCasoFindMany = jest.fn();
const mockCasoUpdate = jest.fn();
const mockTenantFindUnique = jest.fn();
const mockEventCreate = jest.fn();

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    caso: {
      findFirst: mockCasoFindFirst,
      findMany: mockCasoFindMany,
      update: mockCasoUpdate,
    },
    tenant: { findUnique: mockTenantFindUnique },
    event: { create: mockEventCreate },
  })),
}));

jest.mock('../src/events/service', () => ({
  safeRecordEvent: jest.fn(async () => null),
}));

const { closeCaso, getCasosByTenant, getCasoDetail } = require('../src/conversion/caso');
const { safeRecordEvent } = require('../src/events/service');

describe('conversion/caso', () => {
  const baseTenant = { id: 'tenant-1', moedaBase: 'BRL' };
  const baseCaso = { id: 'caso-1', tenantId: 'tenant-1', leadId: 'lead-1', currency: 'BRL', status: 'em_andamento' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindUnique.mockResolvedValue(baseTenant);
    mockCasoFindFirst.mockResolvedValue(baseCaso);
  });

  // --- closeCaso ---
  describe('closeCaso', () => {
    test('rejects without valorRecebido', async () => {
      await expect(
        closeCaso('tenant-1', 'caso-1', { dataRecebimento: '2025-01-15' })
      ).rejects.toThrow('valorRecebido');
    });

    test('rejects valorRecebido = 0', async () => {
      await expect(
        closeCaso('tenant-1', 'caso-1', { valorRecebido: 0, dataRecebimento: '2025-01-15' })
      ).rejects.toThrow('valorRecebido');
    });

    test('rejects invalid dataRecebimento', async () => {
      await expect(
        closeCaso('tenant-1', 'caso-1', { valorRecebido: 1000, dataRecebimento: 'not-a-date' })
      ).rejects.toThrow('dataRecebimento');
    });

    test('rejects when caso not found', async () => {
      mockCasoFindFirst.mockResolvedValue(null);
      await expect(
        closeCaso('tenant-1', 'caso-1', { valorRecebido: 1000, dataRecebimento: '2025-01-15' })
      ).rejects.toThrow('Caso não encontrado');
    });

    test('closes caso with status finalizado', async () => {
      mockCasoUpdate.mockResolvedValue({ ...baseCaso, status: 'finalizado', valorRecebido: 5000 });

      const result = await closeCaso('tenant-1', 'caso-1', {
        valorRecebido: 5000,
        dataRecebimento: '2025-06-15',
      });

      expect(mockCasoUpdate).toHaveBeenCalledWith({
        where: { id: 'caso-1' },
        data: expect.objectContaining({
          status: 'finalizado',
          valorRecebido: 5000,
        }),
      });
      expect(result.status).toBe('finalizado');
    });

    test('records PAYMENT_RECEIVED event', async () => {
      mockCasoUpdate.mockResolvedValue({ ...baseCaso, status: 'finalizado' });

      await closeCaso('tenant-1', 'caso-1', {
        valorRecebido: 5000,
        dataRecebimento: '2025-06-15',
      });

      expect(safeRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          leadId: 'lead-1',
          event: 'payment_received',
        })
      );
    });

    test('calculates valorConvertido when currency differs and exchangeRate provided', async () => {
      mockCasoFindFirst.mockResolvedValue({ ...baseCaso, currency: 'USD' });
      mockCasoUpdate.mockResolvedValue({ ...baseCaso, currency: 'USD', status: 'finalizado' });

      await closeCaso('tenant-1', 'caso-1', {
        valorRecebido: 1000,
        dataRecebimento: '2025-06-15',
        exchangeRate: 5.5,
      });

      expect(mockCasoUpdate).toHaveBeenCalledWith({
        where: { id: 'caso-1' },
        data: expect.objectContaining({
          valorConvertido: 5500,
          exchangeRate: 5.5,
          status: 'finalizado',
        }),
      });
    });

    test('does NOT set valorConvertido when currency matches moedaBase', async () => {
      mockCasoUpdate.mockResolvedValue({ ...baseCaso, status: 'finalizado' });

      await closeCaso('tenant-1', 'caso-1', {
        valorRecebido: 1000,
        dataRecebimento: '2025-06-15',
        exchangeRate: 5.5,
      });

      const updateData = mockCasoUpdate.mock.calls[0][0].data;
      expect(updateData.valorConvertido).toBeUndefined();
      expect(updateData.exchangeRate).toBeUndefined();
    });
  });

  // --- getCasosByTenant ---
  describe('getCasosByTenant', () => {
    test('returns cases for tenant', async () => {
      const cases = [baseCaso];
      mockCasoFindMany.mockResolvedValue(cases);

      const result = await getCasosByTenant('tenant-1');
      expect(mockCasoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          include: expect.objectContaining({ lead: expect.any(Object) }),
        })
      );
      expect(result).toEqual(cases);
    });

    test('applies status filter', async () => {
      mockCasoFindMany.mockResolvedValue([]);

      await getCasosByTenant('tenant-1', { status: 'finalizado' });
      expect(mockCasoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', status: 'finalizado' },
        })
      );
    });
  });

  // --- getCasoDetail ---
  describe('getCasoDetail', () => {
    test('returns caso with full lead info', async () => {
      mockCasoFindFirst.mockResolvedValue({ ...baseCaso, lead: { id: 'lead-1', nome: 'João' } });

      const result = await getCasoDetail('tenant-1', 'caso-1');
      expect(mockCasoFindFirst).toHaveBeenCalledWith({
        where: { id: 'caso-1', tenantId: 'tenant-1' },
        include: { lead: true },
      });
      expect(result.lead.nome).toBe('João');
    });

    test('returns null when caso not found', async () => {
      mockCasoFindFirst.mockResolvedValue(null);
      const result = await getCasoDetail('tenant-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
