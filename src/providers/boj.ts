/**
 * 日本銀行 時系列統計データ API Provider
 * https://www.stat-search.boj.or.jp/
 * APIキー不要（2026/2/18 API公開）
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.stat-search.boj.or.jp/api/v1';

/** 時系列統計データ取得 */
export async function getTimeSeriesData(params: {
  seriesCode: string;
  db?: string;           // データベースコード (FM01等)
  freq?: string;         // D=日次, M=月次, Q=四半期, A=年次
  startDate?: string;    // YYYYMM形式（日次も月単位指定）
  endDate?: string;      // YYYYMM形式
  format?: 'json' | 'csv';
}): Promise<ApiResponse> {
  if (!params.seriesCode?.trim()) {
    return createError('日銀/timeseries', 'seriesCode is required');
  }
  const now = new Date();
  const currentYM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastYearYM = `${now.getFullYear() - 1}01`;

  const url = buildUrl(`${BASE_URL}/getDataCode`, {
    format: params.format || 'json',
    lang: 'JP',
    db: params.db,
    freq: params.freq || 'M',
    startDate: params.startDate || lastYearYM,
    endDate: params.endDate || currentYM,
    code: params.seriesCode,
  });
  return fetchJson(url, {
    source: '日銀/timeseries',
    cacheTtl: CacheTTL.DATA,
  });
}

/** メタデータ取得（系列コード一覧） */
export async function getMetadata(params?: {
  db?: string;    // データベースコード
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/getMetadata`, {
    format: 'json',
    lang: 'JP',
    db: params?.db,
  });
  return fetchJson(url, {
    source: '日銀/metadata',
    cacheTtl: CacheTTL.MASTER,
  });
}

/** 主要統計一覧取得 */
export async function getMajorStatistics(): Promise<ApiResponse> {
  const majorCodes = {
    call_rate: { code: 'STRDCLUCON', db: 'FM01', freq: 'D', description: 'コールレート（無担保O/N）' },
    tankan_di: { code: 'TK99F0000601GCQ00000', db: 'CO', freq: 'Q', description: '短観DI（全産業）' },
    monetary_base: { code: "MD01'MBASE1", db: 'MD', freq: 'M', description: 'マネタリーベース' },
    m2: { code: "MD02'MAAMAG", db: 'MD', freq: 'M', description: 'M2（マネーストック）' },
    cpi_all: { code: "PR01'PRCPI01", db: 'PR', freq: 'M', description: '消費者物価指数（総合）' },
    corporate_goods_price: { code: "PR02'PRCGPI01", db: 'PR', freq: 'M', description: '企業物価指数（総平均）' },
  };

  return {
    success: true,
    data: majorCodes,
    source: '日銀/major_statistics',
    timestamp: new Date().toISOString(),
  };
}
