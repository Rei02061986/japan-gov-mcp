/**
 * G空間情報センター API Provider (CKAN ベース)
 * https://www.geospatial.jp/
 * APIキー不要
 */

import { fetchJson, buildUrl, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.geospatial.jp/ckan/api/3';

/** 地理空間データ横断検索 */
export async function searchGeospatial(params: {
  q?: string;
  fq?: string;
  rows?: number;
  start?: number;
  sort?: string;
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/action/package_search`, {
    q: params.q,
    fq: params.fq,
    rows: params.rows || 20,
    start: params.start || 0,
    sort: params.sort,
  });
  return fetchJson(url, {
    source: 'G空間情報センター/search',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** データセット詳細 */
export async function getGeospatialDataset(params: {
  id: string;
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/action/package_show`, { id: params.id });
  return fetchJson(url, {
    source: 'G空間情報センター/dataset',
    cacheTtl: CacheTTL.DATA,
  });
}

/** 組織一覧 */
export async function listGeospatialOrganizations(): Promise<ApiResponse> {
  return fetchJson(`${BASE_URL}/action/organization_list?all_fields=true`, {
    source: 'G空間情報センター/organizations',
    cacheTtl: CacheTTL.MASTER,
  });
}
