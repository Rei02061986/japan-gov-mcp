/**
 * 国交省データプラットフォーム API Provider
 * https://www.mlit-data.jp/
 * APIキー必要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.mlit-data.jp/api/v1';

export interface MlitDpfConfig {
  apiKey: string;
}

/** インフラデータ横断検索 */
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
  const url = buildUrl(`${BASE_URL}/search`, {
    term: params.term,
    first: params.first || 0,
    size: params.size || 10,
  });
  return fetchJson(url, {
    source: '国交省DPF/search',
    headers: { 'apikey': config.apiKey },
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** データカタログ詳細取得 */
export async function getMlitDpfCatalog(config: MlitDpfConfig, params: {
  id: string;
}): Promise<ApiResponse> {
  if (!config.apiKey?.trim()) {
    return createError('国交省DPF/catalog', 'MLIT_DPF_API_KEY is required');
  }
  if (!params.id?.trim()) {
    return createError('国交省DPF/catalog', 'id is required');
  }
  return fetchJson(`${BASE_URL}/catalog/${params.id}`, {
    source: '国交省DPF/catalog',
    headers: { 'apikey': config.apiKey },
    cacheTtl: CacheTTL.DATA,
  });
}
