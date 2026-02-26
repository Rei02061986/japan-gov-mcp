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
  const fqParts = ['tags:PLATEAU'];
  if (params.prefecture) fqParts.push(`extras_prefecture:${params.prefecture}`);
  if (params.city) fqParts.push(`extras_city:${params.city}`);
  if (params.type) fqParts.push(`extras_type:${params.type}`);

  const url = buildUrl(`${BASE_URL}/action/package_search`, {
    fq: fqParts.join(' AND '),
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
    fq: `tags:PLATEAU AND extras_mesh_code:${params.meshCode}`,
    rows: 10,
  });
  return fetchJson(url, {
    source: 'PLATEAU/citygml',
    cacheTtl: CacheTTL.DATA,
  });
}
