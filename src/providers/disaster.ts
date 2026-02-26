/**
 * 防災・災害 API Provider
 * 浸水ナビ + 河川水位 + 道路交通量
 * APIキー不要
 */

import https from 'node:https';
import crypto from 'node:crypto';
import { fetchJson, fetchXml, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

// ═══════════════════════════════════════════════
// 浸水ナビ (国土地理院)
// https://suiboumap.gsi.go.jp/
// ═══════════════════════════════════════════════

const FLOOD_BASE = 'https://suiboumap.gsi.go.jp';

/** 指定座標の洪水浸水想定（破堤点・最大浸水深）取得 */
export async function getFloodDepth(params: {
  lat: number;
  lon: number;
}): Promise<ApiResponse> {
  const source = '浸水ナビ/flood';
  if (params.lat === undefined || params.lon === undefined) {
    return createError(source, 'lat and lon are required');
  }
  // suiboumap.gsi.go.jp requires legacy SSL renegotiation (Node.js fetch blocks it)
  const path = `/shinsuimap/Api/Public/GetBreakPointMaxDepth?lon=${params.lon}&lat=${params.lat}`;
  return new Promise<ApiResponse>((resolve) => {
    const req = https.get({
      hostname: 'suiboumap.gsi.go.jp',
      path,
      secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(createError(source, `HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve({ success: true, data: JSON.parse(data), source, timestamp: new Date().toISOString() });
        } catch {
          resolve(createError(source, 'Invalid JSON response'));
        }
      });
    });
    req.on('error', (e: Error) => resolve(createError(source, e.message)));
    req.on('timeout', () => { req.destroy(); resolve(createError(source, 'Timeout')); });
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
// 道路交通量 (国交省/JARTIC オープン交通データ WFS 2.0)
// https://api.jartic-open-traffic.org/
// ═══════════════════════════════════════════════

const TRAFFIC_BASE = 'https://api.jartic-open-traffic.org/geoserver';

/** 指定地点周辺の道路交通量データ取得（CSV形式） */
export async function getTrafficVolume(params: {
  lat: number;
  lon: number;
  radius?: number;
  count?: number;
  interval?: '1h' | '5m';
}): Promise<ApiResponse> {
  if (params.lat === undefined || params.lon === undefined) {
    return createError('交通量/volume', 'lat and lon are required');
  }
  const r = params.radius || 5000;
  const delta = r / 111000;
  const minLon = params.lon - delta;
  const minLat = params.lat - delta;
  const maxLon = params.lon + delta;
  const maxLat = params.lat + delta;
  const typeName = params.interval === '5m'
    ? 't_travospublic_measure_5m'
    : 't_travospublic_measure_1h';
  const cqlFilter = `BBOX(ジオメトリ,${minLon},${minLat},${maxLon},${maxLat},'EPSG:4326')`;
  const url = buildUrl(TRAFFIC_BASE, {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    srsName: 'EPSG:4326',
    outputFormat: 'csv',
    count: params.count || 10,
    cql_filter: cqlFilter,
  });
  return fetchXml(url, {
    source: '交通量/volume',
    cacheTtl: CacheTTL.SEARCH,
    timeout: 30000,
  });
}
