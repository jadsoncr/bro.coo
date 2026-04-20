const mockFindUnique = jest.fn(async ({ where }) => {
  if (where.botToken === 'valid-token') {
    return { id: 'tenant-1', nome: 'Santos & Bastos', botToken: 'valid-token', ativo: true };
  }
  return null;
});

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    tenant: {
      findUnique: mockFindUnique,
    },
  })),
}));

const { resolveTenant, getTenantCache } = require('../src/tenants/service');

describe('tenants/service', () => {
  beforeEach(() => {
    getTenantCache().clear();
    mockFindUnique.mockClear();
  });

  test('resolve token válido para tenant', async () => {
    const tenant = await resolveTenant('valid-token');
    expect(tenant.id).toBe('tenant-1');
    expect(tenant.nome).toBe('Santos & Bastos');
  });

  test('retorna null para token inválido', async () => {
    const tenant = await resolveTenant('invalid-token');
    expect(tenant).toBeNull();
  });

  test('usa cache na segunda chamada', async () => {
    await resolveTenant('valid-token');
    await resolveTenant('valid-token');
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });
});
