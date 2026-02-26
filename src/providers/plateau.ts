/**
 * PLATEAU API Provider (国交省 3D都市モデル)
 * https://www.geospatial.jp/ckan/dataset?tags=PLATEAU
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.geospatial.jp/ckan/api/3';

/** PLATEAU 3D都市モデルデータセット検索 */
export async function searchPlateauDatasets(params: {
  prefecture?: string;
  city?: string;
  type?: string;
}): Promise<ApiResponse> {
  // fq with AND causes 409 on geospatial.jp CKAN — use q parameter for search terms
  const qParts = ['PLATEAU'];
  if (params.prefecture) qParts.push(params.prefecture);
  if (params.city) qParts.push(params.city);
  if (params.type) qParts.push(params.type);

  const url = buildUrl(`${BASE_URL}/action/package_search`, {
    q: qParts.join(' '),
    fq: 'tags:PLATEAU',
    rows: 20,
  });
  return fetchJson(url, {
    source: 'PLATEAU/search',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** メッシュコード指定でCityGML情報取得 */
export async function getPlateauCitygml(params: {
  meshCode: string;
}): Promise<ApiResponse> {
  if (!params.meshCode?.trim()) {
    return createError('PLATEAU/citygml', 'meshCode is required');
  }
  const url = buildUrl(`${BASE_URL}/action/package_search`, {
    q: `PLATEAU ${params.meshCode}`,
    fq: 'tags:PLATEAU',
    rows: 10,
  });
  return fetchJson(url, {
    source: 'PLATEAU/citygml',
    cacheTtl: CacheTTL.DATA,
  });
}
