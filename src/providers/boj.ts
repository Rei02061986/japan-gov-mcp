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
  const freq = params.freq || 'M';
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  // 四半期データは開始月(01,04,07,10)のみ受付
  let endDate = params.endDate;
  let startDate = params.startDate;
  if (!endDate) {
    if (freq === 'Q') {
      const qm = [1, 4, 7, 10].reverse().find(q => q <= m) || 1;
      endDate = `${y}${String(qm).padStart(2, '0')}`;
    } else {
      endDate = `${y}${String(m).padStart(2, '0')}`;
    }
  }
  if (!startDate) {
    startDate = `${y - 1}01`;
  }

  const url = buildUrl(`${BASE_URL}/getDataCode`, {
    format: params.format || 'json',
    lang: 'JP',
    db: params.db,
    freq,
    startDate,
    endDate,
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
    tankan_di: { code: 'TK99F0000601GCQ00000', db: 'CO', freq: 'Q', description: '短観DI（全産業）※日付はYYYYMM(01,04,07,10)' },
    monetary_base: { code: 'MABS1AN11', db: 'MD01', freq: 'M', description: 'マネタリーベース平均残高' },
    m2: { code: 'MAM1NAM2M2MO', db: 'MD02', freq: 'M', description: 'M2マネーストック' },
    corporate_goods_price: { code: 'PRCG20_2200000000', db: 'PR01', freq: 'M', description: '国内企業物価指数（総平均）' },
    services_price: { code: 'PRCS20_5200000000', db: 'PR02', freq: 'M', description: 'サービス価格指数（総平均）' },
  };

  return {
    success: true,
    data: majorCodes,
    source: '日銀/major_statistics',
    timestamp: new Date().toISOString(),
  };
}
