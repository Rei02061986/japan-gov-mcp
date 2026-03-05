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
    usd_jpy_monthly: { code: 'FXERM07', db: 'FM08', freq: 'M', description: 'ドル/円 東京市場スポット17時(月中平均)' },
    usd_jpy_daily: { code: 'FXERD04', db: 'FM08', freq: 'D', description: 'ドル/円 東京市場スポット17時(日次)' },
    eur_usd_daily: { code: 'FXERD31', db: 'FM08', freq: 'D', description: 'ユーロ/ドル 東京市場スポット9時(日次)' },
  };

  return {
    success: true,
    data: majorCodes,
    source: '日銀/major_statistics',
    timestamp: new Date().toISOString(),
  };
}

/** 為替レート取得（EUR/JPYはクロスレートを日次から算出→月次集約） */
export async function getExchangeRate(params: {
  pair: 'USD_JPY' | 'EUR_JPY' | 'EUR_USD';
  freq?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ApiResponse> {
  const freq = params.freq || 'M';
  const startDate = params.startDate;
  const endDate = params.endDate;

  if (params.pair === 'USD_JPY') {
    // Monthly available directly
    const code = freq === 'D' ? 'FXERD04' : 'FXERM07';
    return getTimeSeriesData({ seriesCode: code, db: 'FM08', freq, startDate, endDate });
  }
  if (params.pair === 'EUR_USD') {
    // Daily only (no monthly series exists)
    return getTimeSeriesData({ seriesCode: 'FXERD31', db: 'FM08', freq: 'D', startDate, endDate });
  }

  // EUR/JPY = USD/JPY × EUR/USD (both from daily, then aggregate to monthly)
  const [usdJpy, eurUsd] = await Promise.allSettled([
    getTimeSeriesData({ seriesCode: 'FXERD04', db: 'FM08', freq: 'D', startDate, endDate }),
    getTimeSeriesData({ seriesCode: 'FXERD31', db: 'FM08', freq: 'D', startDate, endDate }),
  ]);
  if (usdJpy.status === 'rejected') return createError('日銀/fx', `USD/JPY取得失敗: ${usdJpy.reason}`);
  if (eurUsd.status === 'rejected') return createError('日銀/fx', `EUR/USD取得失敗: ${eurUsd.reason}`);
  if (!usdJpy.value.success) return usdJpy.value;
  if (!eurUsd.value.success) return eurUsd.value;

  // Extract data arrays from BOJ response format
  // BOJ v1 format: { RESULTSET: [{ VALUES: { SURVEY_DATES: [20240101,...], VALUES: [143.38,...] } }] }
  function extractRates(data: any): Array<{ date: string; value: number }> {
    const results: Array<{ date: string; value: number }> = [];
    const rs = data?.RESULTSET;
    if (Array.isArray(rs) && rs.length > 0) {
      const dates = rs[0]?.VALUES?.SURVEY_DATES || [];
      const vals = rs[0]?.VALUES?.VALUES || [];
      for (let i = 0; i < dates.length; i++) {
        const date = String(dates[i]);
        const val = typeof vals[i] === 'number' ? vals[i] : parseFloat(String(vals[i] || ''));
        if (!isNaN(val) && val > 0) results.push({ date, value: val });
      }
      return results;
    }
    // Fallback for other possible formats
    const arr = data?.DataCode || data?.data_list?.data || [];
    if (!Array.isArray(arr)) return results;
    for (const d of arr) {
      const date = d.date || d.DATE || d.TIME || '';
      const raw = d.value ?? d.OBS_VALUE ?? d.VALUE ?? '';
      const val = parseFloat(String(raw));
      if (date && !isNaN(val) && val > 0) results.push({ date: String(date), value: val });
    }
    return results;
  }

  const usdRates = extractRates(usdJpy.value.data);
  const eurRates = extractRates(eurUsd.value.data);

  // Build lookup: date → USD/JPY rate
  const usdMap = new Map<string, number>();
  for (const r of usdRates) usdMap.set(r.date, r.value);

  // Compute daily cross rates
  const dailyCross: Array<{ date: string; usd_jpy: number; eur_usd: number; eur_jpy: number }> = [];
  for (const r of eurRates) {
    const usdJpyVal = usdMap.get(r.date);
    if (usdJpyVal) {
      dailyCross.push({
        date: r.date,
        usd_jpy: usdJpyVal,
        eur_usd: r.value,
        eur_jpy: Math.round(usdJpyVal * r.value * 100) / 100,
      });
    }
  }

  // Aggregate to monthly if requested
  if (freq !== 'D') {
    const monthly = new Map<string, { sum_usd: number; sum_eur_usd: number; sum_eur_jpy: number; count: number }>();
    for (const d of dailyCross) {
      const ym = d.date.slice(0, 6); // YYYYMM
      const m = monthly.get(ym) || { sum_usd: 0, sum_eur_usd: 0, sum_eur_jpy: 0, count: 0 };
      m.sum_usd += d.usd_jpy;
      m.sum_eur_usd += d.eur_usd;
      m.sum_eur_jpy += d.eur_jpy;
      m.count++;
      monthly.set(ym, m);
    }
    const monthlyRates = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, m]) => ({
      date: ym,
      usd_jpy: Math.round(m.sum_usd / m.count * 100) / 100,
      eur_usd: Math.round(m.sum_eur_usd / m.count * 10000) / 10000,
      eur_jpy: Math.round(m.sum_eur_jpy / m.count * 100) / 100,
    }));

    return {
      success: true,
      data: {
        pair: 'EUR/JPY',
        method: 'cross_rate (USD/JPY × EUR/USD, daily→monthly average)',
        frequency: 'monthly',
        count: monthlyRates.length,
        rates: monthlyRates,
      },
      source: '日銀/fx',
      timestamp: new Date().toISOString(),
    };
  }

  return {
    success: true,
    data: {
      pair: 'EUR/JPY',
      method: 'cross_rate (USD/JPY × EUR/USD)',
      frequency: 'daily',
      count: dailyCross.length,
      rates: dailyCross,
    },
    source: '日銀/fx',
    timestamp: new Date().toISOString(),
  };
}
