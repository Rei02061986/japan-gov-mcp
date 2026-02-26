/**
 * Geoshape API Provider (NII)
 * 市区町村・都道府県境界GeoJSON
 * https://geoshape.ex.nii.ac.jp/
 * APIキー不要
 */

import { fetchJson, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://geoshape.ex.nii.ac.jp/city/geojson';

/** 市区町村境界GeoJSON取得 */
export async function getCityBoundary(params: {
  code: string;
}): Promise<ApiResponse> {
  if (!params.code?.trim()) {
    return createError('Geoshape/city', 'code is required');
  }
  return fetchJson(`${BASE_URL}/20240101/${params.code}.json`, {
    source: 'Geoshape/city',
    cacheTtl: CacheTTL.MASTER,
  });
}

/** 都道府県境界GeoJSON取得 */
export async function getPrefBoundary(params: {
  prefCode: string;
}): Promise<ApiResponse> {
  if (!params.prefCode?.trim()) {
    return createError('Geoshape/pref', 'prefCode is required');
  }
  return fetchJson(`${BASE_URL}/20240101/${params.prefCode}.json`, {
    source: 'Geoshape/pref',
    cacheTtl: CacheTTL.MASTER,
  });
}
