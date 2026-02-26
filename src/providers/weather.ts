/**
 * 気象・防災 API Provider
 * 気象庁防災情報 + J-SHIS地震ハザード + AMeDAS + 地震・津波情報
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

// ═══════════════════════════════════════════════
// 気象庁天気予報 - APIキー不要
// https://www.jma.go.jp/bosai/forecast/
// ═══════════════════════════════════════════════

const JMA_BASE = 'https://www.jma.go.jp/bosai';

/** 天気予報取得 */
export async function getForecast(params: {
  areaCode: string;
}): Promise<ApiResponse> {
  if (!params.areaCode?.trim()) {
    return createError('気象庁/forecast', 'areaCode is required');
  }
  return fetchJson(`${JMA_BASE}/forecast/data/forecast/${params.areaCode}.json`, {
    source: '気象庁/forecast',
    cacheTtl: CacheTTL.DATA,
  });
}

/** 天気概況取得 */
export async function getForecastOverview(params: {
  areaCode: string;
}): Promise<ApiResponse> {
  if (!params.areaCode?.trim()) {
    return createError('気象庁/overview', 'areaCode is required');
  }
  return fetchJson(`${JMA_BASE}/forecast/data/overview_forecast/${params.areaCode}.json`, {
    source: '気象庁/overview',
    cacheTtl: CacheTTL.DATA,
  });
}

/** 週間天気予報取得 */
export async function getForecastWeekly(params: {
  areaCode: string;
}): Promise<ApiResponse> {
  if (!params.areaCode?.trim()) {
    return createError('気象庁/weekly', 'areaCode is required');
  }
  return fetchJson(`${JMA_BASE}/forecast/data/forecast/${params.areaCode}.json`, {
    source: '気象庁/weekly',
    cacheTtl: CacheTTL.DATA,
  });
}

/** 台風情報取得 */
export async function getTyphoonInfo(): Promise<ApiResponse> {
  return fetchJson(`${JMA_BASE}/typhoon/data/targetTyphoon.json`, {
    source: '気象庁/typhoon',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** 地震情報一覧取得 */
export async function getEarthquakeList(): Promise<ApiResponse> {
  return fetchJson(`${JMA_BASE}/quake/data/list.json`, {
    source: '気象庁/earthquake',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** 津波情報・警報一覧取得 */
export async function getTsunamiList(): Promise<ApiResponse> {
  return fetchJson(`${JMA_BASE}/tsunami/data/list.json`, {
    source: '気象庁/tsunami',
    cacheTtl: CacheTTL.SEARCH,
  });
}

// ═══════════════════════════════════════════════
// AMeDAS (気象庁) - APIキー不要
// ═══════════════════════════════════════════════

/** アメダス全観測所一覧 */
export async function getAmedasStations(): Promise<ApiResponse> {
  return fetchJson(`${JMA_BASE}/amedas/const/amedastable.json`, {
    source: '気象庁/amedas_stations',
    cacheTtl: CacheTTL.MASTER,
  });
}

/** アメダス観測データ取得 */
export async function getAmedasData(params: {
  pointId: string;
  date?: string;  // YYYYMMDDHH
}): Promise<ApiResponse> {
  if (!params.pointId?.trim()) {
    return createError('気象庁/amedas_data', 'pointId is required');
  }

  // 最新データの場合は latest を使用
  if (!params.date) {
    const latestTime = await fetchJson<Record<string, string>>(`${JMA_BASE}/amedas/data/latest_time.txt`, {
      source: '気象庁/amedas_latest',
    });
    // 直近3時間データを取得
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const dateStr = `${ymd}_${hh}`;
    return fetchJson(`${JMA_BASE}/amedas/data/map/${dateStr}0000.json`, {
      source: '気象庁/amedas_data',
      cacheTtl: CacheTTL.SEARCH,
    });
  }

  // 指定日時データ
  const dateFormatted = params.date.slice(0, 8) + '_' + params.date.slice(8, 10);
  return fetchJson(`${JMA_BASE}/amedas/data/map/${dateFormatted}0000.json`, {
    source: '気象庁/amedas_data',
    cacheTtl: CacheTTL.DATA,
  });
}

// ═══════════════════════════════════════════════
// J-SHIS 地震ハザードステーション (防災科研) - APIキー不要
// https://www.j-shis.bosai.go.jp/
// ═══════════════════════════════════════════════

const JSHIS_BASE = 'https://www.j-shis.bosai.go.jp/map/api';

/** 地震ハザード情報取得 */
export async function getSeismicHazard(params: {
  lat: number;
  lon: number;
}): Promise<ApiResponse> {
  if (params.lat === undefined || params.lon === undefined) {
    return createError('J-SHIS/hazard', 'lat and lon are required');
  }
  const url = buildUrl(`${JSHIS_BASE}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson`, {
    latitude: params.lat,
    longitude: params.lon,
    epsg: 4326,
  });
  return fetchJson(url, {
    source: 'J-SHIS/hazard',
    cacheTtl: CacheTTL.MASTER,
  });
}
