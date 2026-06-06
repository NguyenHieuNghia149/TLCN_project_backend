import {
  parsePositiveIntegerEnv,
  TtlPromiseCache,
} from '../../../apps/api/src/services/submission-metadata-cache';

describe('parsePositiveIntegerEnv', () => {
  it('returns positive integer env values and falls back for invalid values', () => {
    expect(parsePositiveIntegerEnv('2500', 1000)).toBe(2500);
    expect(parsePositiveIntegerEnv(undefined, 1000)).toBe(1000);
    expect(parsePositiveIntegerEnv('abc', 1000)).toBe(1000);
    expect(parsePositiveIntegerEnv('0', 1000)).toBe(1000);
    expect(parsePositiveIntegerEnv('-1', 1000)).toBe(1000);
    expect(parsePositiveIntegerEnv('1.5', 1000)).toBe(1000);
  });
});

describe('TtlPromiseCache', () => {
  it('deduplicates concurrent loads for the same key', async () => {
    let resolveLoad!: (value: string) => void;
    const load = jest.fn(() => new Promise<string>(resolve => {
      resolveLoad = resolve;
    }));
    const cache = new TtlPromiseCache<string>({ ttlMs: 1000, maxSize: 10, now: () => 0 });

    const first = cache.getOrLoad('key', load);
    const second = cache.getOrLoad('key', load);
    resolveLoad('value');

    await expect(Promise.all([first, second])).resolves.toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache rejected loads', async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce('loaded');
    const cache = new TtlPromiseCache<string>({ ttlMs: 1000, maxSize: 10, now: () => 0 });

    await expect(cache.getOrLoad('key', load)).rejects.toThrow('load failed');
    await expect(cache.getOrLoad('key', load)).resolves.toBe('loaded');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads after TTL expires using injectable now()', async () => {
    let currentTime = 0;
    const load = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const cache = new TtlPromiseCache<string>({
      ttlMs: 100,
      maxSize: 10,
      now: () => currentTime,
    });

    await expect(cache.getOrLoad('key', load)).resolves.toBe('first');
    currentTime = 99;
    await expect(cache.getOrLoad('key', load)).resolves.toBe('first');
    currentTime = 100;
    await expect(cache.getOrLoad('key', load)).resolves.toBe('second');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('delete(key) invalidates the exact key', async () => {
    const loadA = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('a1')
      .mockResolvedValueOnce('a2');
    const loadB = jest.fn<Promise<string>, []>().mockResolvedValue('b1');
    const cache = new TtlPromiseCache<string>({ ttlMs: 1000, maxSize: 10, now: () => 0 });

    await cache.getOrLoad('a', loadA);
    await cache.getOrLoad('b', loadB);

    expect(cache.delete('a')).toBe(true);
    await expect(cache.getOrLoad('a', loadA)).resolves.toBe('a2');
    await expect(cache.getOrLoad('b', loadB)).resolves.toBe('b1');

    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it('enforces maxSize before entries expire', async () => {
    const cache = new TtlPromiseCache<string>({ ttlMs: 1000, maxSize: 2, now: () => 0 });
    const loads = {
      a: jest.fn<Promise<string>, []>().mockResolvedValue('a'),
      b: jest.fn<Promise<string>, []>().mockResolvedValue('b'),
      c: jest.fn<Promise<string>, []>().mockResolvedValue('c'),
      reloadA: jest.fn<Promise<string>, []>().mockResolvedValue('a-reloaded'),
    };

    await cache.getOrLoad('a', loads.a);
    await cache.getOrLoad('b', loads.b);
    await cache.getOrLoad('c', loads.c);

    expect(cache.size()).toBe(2);
    await expect(cache.getOrLoad('a', loads.reloadA)).resolves.toBe('a-reloaded');
    expect(loads.reloadA).toHaveBeenCalledTimes(1);
  });

  it('cleans expired entries before maxSize overflow', async () => {
    let currentTime = 0;
    const cache = new TtlPromiseCache<string>({
      ttlMs: 100,
      maxSize: 2,
      now: () => currentTime,
    });
    const loadA = jest.fn<Promise<string>, []>().mockResolvedValue('a');
    const loadB = jest.fn<Promise<string>, []>().mockResolvedValue('b');
    const loadC = jest.fn<Promise<string>, []>().mockResolvedValue('c');
    const reloadB = jest.fn<Promise<string>, []>().mockResolvedValue('b');

    await cache.getOrLoad('a', loadA);
    currentTime = 50;
    await cache.getOrLoad('b', loadB);
    currentTime = 100;
    await cache.getOrLoad('c', loadC);

    expect(cache.size()).toBe(2);
    await expect(cache.getOrLoad('b', reloadB)).resolves.toBe('b');
    expect(reloadB).not.toHaveBeenCalled();
  });
});
