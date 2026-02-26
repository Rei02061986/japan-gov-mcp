/**
 * 科学・環境 API Provider
 * そらまめくん + シームレス地質図 + JAXA G-Portal
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

// ═══════════════════════════════════════════════
// そらまめくん (環境省 大気汚染物質広域監視システム)
// https://soramame.env.go.jp/
// ═══════════════════════════════════════════════

const SORAMAME_BASE = 'https://soramame.env.go.jp/soramame/api/v1';

/** 大気汚染リアルタイムデータ取得 */
export async function getAirQuality(params: {
  stationCode?: string;
}): Promise<ApiResponse> {
  const url = params.stationCode
    ? buildUrl(`${SORAMAME_BASE}/stations/${params.stationCode}/latest`, {})
    : `${SORAMAME_BASE}/latest`;
  return fetchJson(url, {
    source: 'そらまめくん/air_quality',
    cacheTtl: CacheTTL.SEARCH,
  });
}

// ═══════════════════════════════════════════════
// シームレス地質図 (産総研/GSJ)
// https://gbank.gsj.jp/seamless/
// ═══════════════════════════════════════════════

const GEOLOGY_BASE = 'https://gbank.gsj.jp/seamless/v2';

/** 地質図凡例一覧 */
export async function getGeologyLegend(): Promise<ApiResponse> {
  return fetchJson(`${GEOLOGY_BASE}/api/1.3.1/legend.json`, {
    source: '地質図/legend',
    cacheTtl: CacheTTL.MASTER,
  });
}

/** 指定地点の地質情報取得 */
export async function getGeologyAtPoint(params: {
  lat: number;
  lon: number;
}): Promise<ApiResponse> {
  if (!Number.isFinite(params.lat) || !Number.isFinite(params.lon)) {
    return createError('地質図/at_point', 'lat and lon must be finite numbers');
  }
  if (params.lat < -90 || params.lat > 90) {
    return createError('地質図/at_point', 'lat must be between -90 and 90');
  }
  if (params.lon < -180 || params.lon > 180) {
    return createError('地質図/at_point', 'lon must be between -180 and 180');
  }
  const url = buildUrl(`${GEOLOGY_BASE}/api/1.3.1/legend.json`, {
    point: `${params.lat},${params.lon}`,
  });
  return fetchJson(url, {
    source: '地質図/at_point',
    cacheTtl: CacheTTL.MASTER,
  });
}

// ═══════════════════════════════════════════════
// JAXA G-Portal / Earth API
// https://gportal.jaxa.jp/
// ═══════════════════════════════════════════════

const JAXA_BASE = 'https://gportal.jaxa.jp/csw/csw';

/** JAXA衛星データコレクション一覧 */
export async function getJaxaCollections(params: {
  limit?: number;
}): Promise<ApiResponse> {
  const url = buildUrl(JAXA_BASE, {
    service: 'CSW',
    version: '3.0.0',
    request: 'GetRecords',
    resultType: 'results',
    outputFormat: 'application/json',
    maxRecords: params.limit || 20,
    typeNames: 'csw:Record',
  });
  return fetchJson(url, {
    source: 'JAXA/collections',
    cacheTtl: CacheTTL.MASTER,
  });
}
