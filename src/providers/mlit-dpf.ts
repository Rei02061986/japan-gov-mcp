/**
 * 国交省データプラットフォーム API Provider
 * https://data-platform.mlit.go.jp/
 * APIキー必要 — GraphQL API
 */

import { createError, CacheTTL, cache } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://data-platform.mlit.go.jp/api/v1/';

export interface MlitDpfConfig {
  apiKey: string;
}

/** GraphQLリクエスト送信 */
async function graphqlRequest<T = any>(
  config: MlitDpfConfig,
  query: string,
  source: string,
  cacheTtl?: number,
): Promise<ApiResponse<T>> {
  const cacheKey = `mlit-dpf:${query}`;
  if (cacheTtl) {
    const cached = cache.get(cacheKey);
    if (cached) return cached as ApiResponse<T>;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return createError(source, `HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as T;
    const response: ApiResponse<T> = {
      success: true,
      data,
      source,
      timestamp: new Date().toISOString(),
    };

    if (cacheTtl) {
      cache.set(cacheKey, response, cacheTtl);
    }

    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    return createError(source, err.message || 'Unknown error');
  }
}

/** インフラデータ横断検索 (GraphQL) */
export async function searchMlitDpf(config: MlitDpfConfig, params: {
  term: string;
  first?: number;
  size?: number;
}): Promise<ApiResponse> {
  if (!config.apiKey?.trim()) {
    return createError('国交省DPF/search', 'MLIT_DPF_API_KEY is required');
  }
  if (!params.term?.trim()) {
    return createError('国交省DPF/search', 'term is required');
  }
  const first = params.first || 0;
  const size = params.size || 10;
  const query = `query { search(first: ${first}, size: ${size}, term: "${params.term}", phraseMatch: true) { totalNumber searchResults { id title lat lon year dataset_id catalog_id } } }`;
  return graphqlRequest(config, query, '国交省DPF/search', CacheTTL.SEARCH);
}

/** データカタログ詳細取得 (GraphQL) */
export async function getMlitDpfCatalog(config: MlitDpfConfig, params: {
  id: string;
}): Promise<ApiResponse> {
  if (!config.apiKey?.trim()) {
    return createError('国交省DPF/catalog', 'MLIT_DPF_API_KEY is required');
  }
  if (!params.id?.trim()) {
    return createError('国交省DPF/catalog', 'id is required');
  }
  const query = `query { catalog(id: "${params.id}") { id title description } }`;
  return graphqlRequest(config, query, '国交省DPF/catalog', CacheTTL.DATA);
}
