type TtlPromiseCacheOptions = {
  ttlMs: number;
  maxSize: number;
  now?: () => number;
};

type CacheEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

export function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class TtlPromiseCache<T> {
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: TtlPromiseCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxSize = options.maxSize;
    this.now = options.now ?? Date.now;
  }

  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.promise;
    }

    if (existing) {
      this.entries.delete(key);
    }

    const promise = load();
    this.entries.set(key, {
      promise,
      expiresAt: now + this.ttlMs,
    });

    promise.catch(() => {
      const entry = this.entries.get(key);
      if (entry?.promise === promise) {
        this.entries.delete(key);
      }
    });

    this.enforceMaxSize(now);
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  size(): number {
    this.cleanup(this.now());
    return this.entries.size;
  }

  cleanup(now: number = this.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private enforceMaxSize(now: number): void {
    this.cleanup(now);

    // FIFO after cleanup, not LRU or earliest-expiry.
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

type ProblemExecutionMetadata = { problem: any; testcases: any[] };

const metadataCacheTtlMs = parsePositiveIntegerEnv(
  process.env.SUBMISSION_METADATA_CACHE_TTL_MS,
  60_000,
);
const metadataCacheMaxSize = parsePositiveIntegerEnv(
  process.env.SUBMISSION_METADATA_CACHE_MAX_SIZE,
  1_000,
);

export const submissionMetadataCaches = {
  problem: new TtlPromiseCache<ProblemExecutionMetadata>({
    ttlMs: metadataCacheTtlMs,
    maxSize: metadataCacheMaxSize,
  }),
  language: new TtlPromiseCache<any>({
    ttlMs: metadataCacheTtlMs,
    maxSize: metadataCacheMaxSize,
  }),
};

export const submissionMetadataInvalidator = {
  invalidateProblem(problemId: string): void {
    submissionMetadataCaches.problem.delete(`problem:${problemId}`);
  },
  invalidateLanguage(language: string): void {
    submissionMetadataCaches.language.delete(`language:${language}`);
  },
};
