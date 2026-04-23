// tests/flow-cache.test.js
const mockFlowFindFirst = jest.fn();

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    flow: { findFirst: mockFlowFindFirst },
  })),
}));

const { getFlow, invalidateCache, invalidateAll, _clearCache, _getCacheMap } = require('../src/flow/cache');

const TENANT_ID = 'tenant-1';
const FLOW_ID = 'flow-1';

const sampleFlow = {
  id: FLOW_ID,
  tenantId: TENANT_ID,
  objetivo: 'leads',
  ativo: true,
  config: {},
  nodes: [
    { id: 'n1', flowId: FLOW_ID, estado: 'start', tipo: 'menu', mensagem: 'Olá!', opcoes: [], ordem: 0 },
  ],
};

beforeEach(() => {
  _clearCache();
  mockFlowFindFirst.mockReset();
});

describe('flow/cache — getFlow', () => {
  test('fetches from DB on cache miss and caches result', async () => {
    mockFlowFindFirst
      .mockResolvedValueOnce({ id: FLOW_ID }) // resolve flowId
      .mockResolvedValueOnce(sampleFlow);      // fetch with include

    const result = await getFlow(TENANT_ID);
    expect(result).toEqual(sampleFlow);
    expect(mockFlowFindFirst).toHaveBeenCalledTimes(2);

    // Second call should use cache
    mockFlowFindFirst.mockClear();
    const cached = await getFlow(TENANT_ID, FLOW_ID);
    expect(cached).toEqual(sampleFlow);
    expect(mockFlowFindFirst).not.toHaveBeenCalled();
  });

  test('returns null when no active flow exists', async () => {
    mockFlowFindFirst.mockResolvedValue(null);
    const result = await getFlow(TENANT_ID);
    expect(result).toBeNull();
  });

  test('fetches directly when flowId is provided', async () => {
    mockFlowFindFirst.mockResolvedValueOnce(sampleFlow);
    const result = await getFlow(TENANT_ID, FLOW_ID);
    expect(result).toEqual(sampleFlow);
    expect(mockFlowFindFirst).toHaveBeenCalledTimes(1);
  });

  test('re-fetches after TTL expires', async () => {
    mockFlowFindFirst.mockResolvedValue(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);

    // Manually expire the cache entry
    const cache = _getCacheMap();
    const key = `${TENANT_ID}:${FLOW_ID}`;
    const entry = cache.get(key);
    entry.expiresAt = Date.now() - 1;

    mockFlowFindFirst.mockClear();
    mockFlowFindFirst.mockResolvedValueOnce(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);
    expect(mockFlowFindFirst).toHaveBeenCalledTimes(1);
  });
});

describe('flow/cache — invalidation', () => {
  test('invalidateCache removes specific flow from cache', async () => {
    mockFlowFindFirst.mockResolvedValue(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);

    invalidateCache(TENANT_ID, FLOW_ID);
    expect(_getCacheMap().size).toBe(0);

    // Next call should fetch from DB
    mockFlowFindFirst.mockClear();
    mockFlowFindFirst.mockResolvedValueOnce(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);
    expect(mockFlowFindFirst).toHaveBeenCalledTimes(1);
  });

  test('invalidateAll removes all flows for a tenant', async () => {
    mockFlowFindFirst.mockResolvedValue(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);
    await getFlow(TENANT_ID, 'flow-2'); // different flow (will cache null)

    invalidateAll(TENANT_ID);
    expect(_getCacheMap().size).toBe(0);
  });

  test('invalidateAll does not affect other tenants', async () => {
    mockFlowFindFirst.mockResolvedValue(sampleFlow);
    await getFlow(TENANT_ID, FLOW_ID);
    await getFlow('tenant-2', FLOW_ID);

    invalidateAll(TENANT_ID);
    // tenant-2's entry should remain
    expect(_getCacheMap().has(`tenant-2:${FLOW_ID}`)).toBe(true);
    expect(_getCacheMap().has(`${TENANT_ID}:${FLOW_ID}`)).toBe(false);
  });
});
