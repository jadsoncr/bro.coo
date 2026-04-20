describe('storage/index em modo postgres', () => {
  const originalAdapter = process.env.STORAGE_ADAPTER;
  const originalDefaultTenant = process.env.DEFAULT_TENANT_ID;

  beforeEach(() => {
    jest.resetModules();
    process.env.STORAGE_ADAPTER = 'postgres';
    delete process.env.DEFAULT_TENANT_ID;
    global._currentTenantId = 'tenant-current';
  });

  afterEach(() => {
    jest.resetModules();
    if (originalAdapter === undefined) delete process.env.STORAGE_ADAPTER;
    else process.env.STORAGE_ADAPTER = originalAdapter;
    if (originalDefaultTenant === undefined) delete process.env.DEFAULT_TENANT_ID;
    else process.env.DEFAULT_TENANT_ID = originalDefaultTenant;
    delete global._currentTenantId;
  });

  test('injeta tenant atual ao persistir abandono', async () => {
    const createAbandono = jest.fn(async data => data);

    jest.doMock('../src/storage/redisSession', () => ({
      getSession: jest.fn(),
      updateSession: jest.fn(),
      resetSession: jest.fn(),
    }));
    jest.doMock('../src/storage/postgres', () => ({
      createLead: jest.fn(async data => data),
      createClient: jest.fn(async data => data),
      createOther: jest.fn(async data => data),
      createAbandono,
    }));

    const storage = require('../src/storage');
    await storage.createAbandono({ sessao: '123', ultimoEstado: 'coleta_nome' });

    expect(createAbandono).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-current',
        sessao: '123',
        ultimoEstado: 'coleta_nome',
      })
    );
  });

  test('usa DEFAULT_TENANT_ID quando não há tenant global', async () => {
    const createLead = jest.fn(async data => data);
    delete global._currentTenantId;
    process.env.DEFAULT_TENANT_ID = 'tenant-default';

    jest.doMock('../src/storage/redisSession', () => ({
      getSession: jest.fn(),
      updateSession: jest.fn(),
      resetSession: jest.fn(),
    }));
    jest.doMock('../src/storage/postgres', () => ({
      createLead,
      createClient: jest.fn(async data => data),
      createOther: jest.fn(async data => data),
      createAbandono: jest.fn(async data => data),
    }));

    const storage = require('../src/storage');
    await storage.createLead({ telefone: '123' });

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-default' })
    );
  });
});
