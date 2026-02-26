/**
 * 地理空間 API Provider
 * 国土地理院ジオコーディング - APIキー不要
 * https://msearch.gsi.go.jp/
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const GSI_GEOCODE_BASE = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const GSI_REVERSE_BASE = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';

/** 住所から緯度経度を検索 */
export async function geocode(params: {
  address: string;
}): Promise<ApiResponse> {
  if (!params.address?.trim()) {
    return createError('国土地理院/geocode', 'address is required');
  }
  const url = buildUrl(GSI_GEOCODE_BASE, { q: params.address });
  return fetchJson(url, {
    source: '国土地理院/geocode',
    cacheTtl: CacheTTL.MASTER,
  });
}

/** 緯度経度から住所を取得 */
export async function reverseGeocode(params: {
  lat: number;
  lon: number;
}): Promise<ApiResponse> {
  if (params.lat === undefined || params.lon === undefined) {
    return createError('国土地理院/reverse_geocode', 'lat and lon are required');
  }
  const url = buildUrl(GSI_REVERSE_BASE, {
    lat: params.lat,
    lon: params.lon,
  });
  return fetchJson(url, {
    source: '国土地理院/reverse_geocode',
    cacheTtl: CacheTTL.MASTER,
  });
}
