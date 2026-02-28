/**
 * 共通HTTPユーティリティ
 * 全Providerが使用する統一的なHTTPクライアント
 */

/** 全APIレスポンスの統一型 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  source: string;
  timestamp: string;
  cached?: boolean;
}

/** エラーレスポンスを生成する共通ヘルパー */
export function createError<T = never>(source: string, error: string): ApiResponse<T> {
  return {
    success: false,
    error,
    source,
    timestamp: new Date().toISOString(),
  };
}

/** 必須文字列パラメータの検証 */
export function ensureRequired(value: string | undefined, name: string, source: string): ApiResponse<never> | undefined {
  if (!value?.trim()) {
    return createError(source, `${name} is required`);
  }
  return undefined;
}

/** 数値範囲の検証 */
export function ensureRange(
  value: number | undefined,
  name: string,
  source: string,
  min: number,
  max: number,
): ApiResponse<never> | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    return createError(source, `${name} must be an integer between ${min} and ${max}`);
  }
  return undefined;
}

// ═══════════════════════════════════════════════
// In-memory LRU Cache with TTL
// ═══════════════════════════════════════════════

interface CacheEntry {
  response: ApiResponse;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 256;

class LruCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  get(key: string): ApiResponse | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return { ...entry.response, cached: true };
  }

  set(key: string, response: ApiResponse, ttlMs: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { response, expiresAt: Date.now() + ttlMs });
  }

  get size() { return this.cache.size; }

  clear(): void { this.cache.clear(); }
}

/** グローバルキャッシュインスタンス */
export const cache = new LruCache();

/** キャッシュTTL定数 */
export const CacheTTL = {
  /** マスタデータ（都道府県一覧等）: 1時間 */
  MASTER: 60 * 60 * 1000,
  /** 統計データ: 5分 */
  DATA: 5 * 60 * 1000,
  /** 検索結果: 2分 */
  SEARCH: 2 * 60 * 1000,
} as const;

// ═══════════════════════════════════════════════
// Rate Limiter — Token Bucket (per host)
// ═══════════════════════════════════════════════

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(maxTokens: number, refillPerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  /** トークンを1つ取得。不足時は待機 */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const DEFAULT_RATE = 5; // 5 requests/sec per host
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/** ホスト別レートリミッターレジストリ */
export const rateLimiters = new Map<string, TokenBucket>();

/** ホスト別のレートリミッターを取得 */
function getRateLimiter(url: string): TokenBucket {
  const host = new URL(url).host;
  let limiter = rateLimiters.get(host);
  if (!limiter) {
    limiter = new TokenBucket(DEFAULT_RATE, DEFAULT_RATE);
    rateLimiters.set(host, limiter);
  }
  return limiter;
}

/** レートリミット + 429リトライ付きfetch */
async function fetchWithRateLimit(
  url: string,
  init: RequestInit,
  source: string,
): Promise<Response> {
  const limiter = getRateLimiter(url);
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await limiter.acquire();
    const res = await fetch(url, init);

    if (res.status !== 429) return res;

    lastResponse = res;
    if (attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.error(`[${source}] 429 Rate Limited, retry ${attempt + 1}/${MAX_RETRIES} after ${waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  return lastResponse!;
}

// ═══════════════════════════════════════════════
// HTTP Fetch Functions
// ═══════════════════════════════════════════════

interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
  source: string;
  /** キャッシュTTL(ms)。0 or undefinedでキャッシュ無効 */
  cacheTtl?: number;
}

/**
 * JSON APIを呼び出す
 * @param url - リクエストURL
 * @param options - ヘッダー、タイムアウト、ソース名、キャッシュTTL
 */
export async function fetchJson<T = any>(
  url: string,
  options: FetchOptions
): Promise<ApiResponse<T>> {
  // Check cache
  if (options.cacheTtl) {
    const cached = cache.get(url);
    if (cached) return cached as ApiResponse<T>;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 40000);

  try {
    const res = await fetchWithRateLimit(url, {
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    }, options.source);

    clearTimeout(timeoutId);

    if (!res.ok) {
      return createError(options.source, `HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as T;
    const response: ApiResponse<T> = {
      success: true,
      data,
      source: options.source,
      timestamp: new Date().toISOString(),
    };

    // Store in cache if TTL specified
    if (options.cacheTtl) {
      cache.set(url, response, options.cacheTtl);
    }

    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    return createError(options.source, err.message || 'Unknown error');
  }
}

/**
 * XML APIを呼び出す（法令API等で使用）
 */
export async function fetchXml(
  url: string,
  options: FetchOptions
): Promise<ApiResponse<string>> {
  // Check cache
  if (options.cacheTtl) {
    const cached = cache.get(url);
    if (cached) return cached as ApiResponse<string>;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 40000);

  try {
    const res = await fetchWithRateLimit(url, {
      headers: {
        'Accept': 'application/xml',
        ...options.headers,
      },
      signal: controller.signal,
    }, options.source);

    clearTimeout(timeoutId);

    if (!res.ok) {
      return createError(options.source, `HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    const response: ApiResponse<string> = {
      success: true,
      data: text,
      source: options.source,
      timestamp: new Date().toISOString(),
    };

    if (options.cacheTtl) {
      cache.set(url, response, options.cacheTtl);
    }

    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    return createError(options.source, err.message || 'Unknown error');
  }
}

/**
 * URLビルダー - ベースURLにクエリパラメータを付与
 */
export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
