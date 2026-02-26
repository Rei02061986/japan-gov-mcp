/**
 * 防災・災害 API Provider
 * 浸水ナビ + 河川水位 + 道路交通量
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

// ═══════════════════════════════════════════════
// 浸水ナビ (国土地理院)
// https://suiboumap.gsi.go.jp/
// ═══════════════════════════════════════════════

const FLOOD_BASE = 'https://suiboumap.gsi.go.jp';

/** 指定座標の洪水浸水想定深さ・ハザード情報取得 */
export async function getFloodDepth(params: {
  lat: number;
  lon: number;
  groupType?: number; // 0=国管理（デフォルト） 1=県管理
}): Promise<ApiResponse> {
  if (params.lat === undefined || params.lon === undefined) {
    return createError('浸水ナビ/flood', 'lat and lon are required');
  }
  const url = buildUrl(`${FLOOD_BASE}/shinsuimap/Api/Public/GetFloodDepth`, {
    lat: params.lat,
    lon: params.lon,
    groupType: params.groupType ?? 0,
  });
  return fetchJson(url, {
    source: '浸水ナビ/flood',
    cacheTtl: CacheTTL.MASTER,
  });
}

// ═══════════════════════════════════════════════
// 河川水位情報
// https://www.river.go.jp/
// ═══════════════════════════════════════════════

const RIVER_BASE = 'https://www.river.go.jp/kawabou/ipSuiiKobetu';

/** リアルタイム河川水位情報取得 */
export async function getRiverLevel(params: {
  stationId: string;
}): Promise<ApiResponse> {
  if (!params.stationId?.trim()) {
    return createError('河川水位/level', 'stationId is required');
  }
  const url = buildUrl(RIVER_BASE, {
    obsrvId: params.stationId,
    gamenFlg: 0,
  });
  return fetchJson(url, {
    source: '河川水位/level',
    cacheTtl: CacheTTL.SEARCH,
  });
}

// ═══════════════════════════════════════════════
// 道路交通量 (国交省/JARTIC WFS)
// ═══════════════════════════════════════════════

const TRAFFIC_BASE = 'https://www.jartic.or.jp/d/wfs';

/** 指定地点周辺の道路交通量データ取得 */
export async function getTrafficVolume(params: {
  lat: number;
  lon: number;
  radius?: number;
  count?: number;
}): Promise<ApiResponse> {
  if (params.lat === undefined || params.lon === undefined) {
    return createError('交通量/volume', 'lat and lon are required');
  }
  const r = params.radius || 1000;
  // WFS BBOX: lon-delta,lat-delta,lon+delta,lat+delta
  const delta = r / 111000; // approximate degrees
  const bbox = `${params.lon - delta},${params.lat - delta},${params.lon + delta},${params.lat + delta}`;
  const url = buildUrl(TRAFFIC_BASE, {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'traffic:volume',
    bbox,
    count: params.count || 10,
    outputFormat: 'application/json',
  });
  return fetchJson(url, {
    source: '交通量/volume',
    cacheTtl: CacheTTL.SEARCH,
  });
}
