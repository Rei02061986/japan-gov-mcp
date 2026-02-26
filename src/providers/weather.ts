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

/** 台風情報取得（台風がない場合はその旨を返す） */
export async function getTyphoonInfo(): Promise<ApiResponse> {
  const res = await fetchJson(`${JMA_BASE}/typhoon/data/targetTyphoon.json`, {
    source: '気象庁/typhoon',
    cacheTtl: CacheTTL.SEARCH,
  });
  // JMA typhoon endpoint: 404/parse error = 台風データなし（正常応答扱い）
  // The endpoint returns SPA HTML (not JSON) when no typhoon data exists
  if (!res.success) {
    return {
      success: true,
      data: { message: '現在、台風情報はありません', typhoons: [] },
      source: '気象庁/typhoon',
      timestamp: new Date().toISOString(),
    };
  }
  return res;
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

/** アメダス観測データ取得（観測所別） */
export async function getAmedasData(params: {
  pointId: string;
  date?: string;  // YYYYMMDDHH
}): Promise<ApiResponse> {
  if (!params.pointId?.trim()) {
    return createError('気象庁/amedas_data', 'pointId is required');
  }

  // 最新データの場合: 直近3時間ブロックを使用
  if (!params.date) {
    // JST = UTC+9 で計算
    const now = new Date();
    const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
    const jst = new Date(jstMs);
    const ymd = jst.toISOString().slice(0, 10).replace(/-/g, '');
    // 3時間ブロックに切り捨て (00,03,06,09,12,15,18,21)
    const hh = String(Math.floor(jst.getUTCHours() / 3) * 3).padStart(2, '0');
    return fetchJson(`${JMA_BASE}/amedas/data/point/${params.pointId}/${ymd}_${hh}.json`, {
      source: '気象庁/amedas_data',
      cacheTtl: CacheTTL.SEARCH,
    });
  }

  // 指定日時データ (YYYYMMDDHH → YYYYMMDD_HH)
  const dateFormatted = params.date.slice(0, 8) + '_' + params.date.slice(8, 10);
  return fetchJson(`${JMA_BASE}/amedas/data/point/${params.pointId}/${dateFormatted}.json`, {
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
  // J-SHIS API requires position=lon,lat (longitude first)
  const url = buildUrl(`${JSHIS_BASE}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson`, {
    position: `${params.lon},${params.lat}`,
    epsg: 4326,
  });
  return fetchJson(url, {
    source: 'J-SHIS/hazard',
    cacheTtl: CacheTTL.MASTER,
  });
}
