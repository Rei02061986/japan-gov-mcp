/**
 * 日本銀行 時系列統計データ API Provider
 * https://www.stat-search.boj.or.jp/
 * APIキー不要（2026/2/18開始）
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.stat-search.boj.or.jp/ssi/api';

/** 時系列統計データ取得 */
export async function getTimeSeriesData(params: {
  seriesCode: string;
  fromYear?: number;
  toYear?: number;
  frequency?: 'MM' | 'QQ' | 'AA';
  format?: 'CSV' | 'JSON';
}): Promise<ApiResponse> {
  if (!params.seriesCode?.trim()) {
    return createError('日銀/timeseries', 'seriesCode is required');
  }
  const now = new Date().getFullYear();
  const url = buildUrl(`${BASE_URL}/dataSearchService`, {
    code: params.seriesCode,
    from: (params.fromYear || now - 10).toString(),
    to: (params.toYear || now).toString(),
    frequency: params.frequency || 'MM',
    format: params.format || 'CSV',
  });
  return fetchJson(url, {
    source: '日銀/timeseries',
    cacheTtl: CacheTTL.DATA,
  });
}

/** 主要統計一覧取得 */
export async function getMajorStatistics(): Promise<ApiResponse> {
  // 主要な時系列コードのハードコード一覧
  const majorCodes = {
    monetary_base: { code: "MD01'MBASE1", description: 'マネタリーベース' },
    m2: { code: "MD02'MAAMAG", description: 'M2（マネーストック）' },
    cpi_all: { code: "PR01'PRCPI01", description: '消費者物価指数（総合）' },
    usdjpy: { code: 'FEXXUSJP', description: 'USD/JPY 為替レート' },
    eurjpy: { code: 'FEXXEUJP', description: 'EUR/JPY 為替レート' },
    call_rate: { code: "IR01'TIRCOM", description: 'コールレート（無担保O/N）' },
    govt_bond_10y: { code: "IR02'TIRCOM10Y", description: '国債10年利回り' },
    corporate_goods_price: { code: "PR02'PRCGPI01", description: '企業物価指数（総平均）' },
  };

  return {
    success: true,
    data: majorCodes,
    source: '日銀/major_statistics',
    timestamp: new Date().toISOString(),
  };
}
