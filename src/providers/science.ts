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

const SORAMAME_BASE = 'https://soramame.env.go.jp/soramame/api';

/**
 * 大気汚染データ検索
 * @param params.prefCode - 都道府県コード 01-47（必須）
 * @param params.startYM - 開始年月 YYYYMM（省略時は今月）
 * @param params.endYM - 終了年月 YYYYMM（省略時は今月）
 * @param params.stationCode - 測定局コード（カンマ区切りで複数可）
 * @param params.dataItems - データ項目（カンマ区切り: PM2_5,OX,NO2,SO2,CO,SPM,TEMP等）
 */
export async function getAirQuality(params: {
  prefCode?: string;
  startYM?: string;
  endYM?: string;
  stationCode?: string;
  dataItems?: string;
}): Promise<ApiResponse> {
  const now = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefCode = params.prefCode || '13'; // default: Tokyo
  const url = buildUrl(`${SORAMAME_BASE}/data_search`, {
    Start_YM: params.startYM || currentYM,
    End_YM: params.endYM,
    TDFKN_CD: prefCode,
    SKT_CD: params.stationCode,
    REQUEST_DATA: params.dataItems || 'PM2_5',
  });
  return fetchJson(url, {
    source: 'そらまめくん/air_quality',
    cacheTtl: CacheTTL.SEARCH,
    timeout: 30000, // slow API
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
// JAXA Earth API (STAC 1.0.0)
// https://data.earth.jaxa.jp/
// ═══════════════════════════════════════════════

const JAXA_STAC_URL = 'https://data.earth.jaxa.jp/stac/cog/v1/catalog.json';

/** JAXA衛星データコレクション一覧 (STAC Catalog) */
export async function getJaxaCollections(params: {
  limit?: number;
}): Promise<ApiResponse> {
  return fetchJson(JAXA_STAC_URL, {
    source: 'JAXA/collections',
    cacheTtl: CacheTTL.MASTER,
  });
}
