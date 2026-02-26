/**
 * 地域医療×経済 + 労働需給 シナリオ
 */

import type { ApiResponse } from '../utils/http.js';
import { createError } from '../utils/http.js';
import * as ndb from '../providers/ndb.js';
import * as boj from '../providers/boj.js';
import { getDashboardData, searchJobs } from '../providers/misc.js';
import type { HelloworkConfig } from '../providers/misc.js';

/**
 * 地域医療×マクロ経済 統合分析
 * NDB健診データ + 統計ダッシュボード人口 + 日銀マクロ指標
 */
export async function regionalHealthEconomy(params: {
  prefectureCode: string;
  year?: number;
}): Promise<ApiResponse<unknown>> {
  const source = 'Scenario/regional_health_economy';

  if (!params.prefectureCode?.trim()) {
    return createError(source, 'prefectureCode is required');
  }

  try {
    const [healthResult, populationResult, macroResult] = await Promise.allSettled([
      // NDB健診データ (BMI分布)
      ndb.getInspectionStats({
        itemName: 'BMI',
        areaType: 'prefecture',
        prefectureName: params.prefectureCode,
      }),
      // 統計ダッシュボード: 人口総数
      getDashboardData({
        indicatorCode: 'A1101',
        regionCode: params.prefectureCode,
      }),
      // 日銀マクロ: CPI
      boj.getTimeSeriesData({
        seriesCode: "PR01'PRCPI01",
        fromYear: (params.year || new Date().getFullYear()) - 5,
        toYear: params.year || new Date().getFullYear(),
      }),
    ]);

    const extract = (r: PromiseSettledResult<ApiResponse>) =>
      r.status === 'fulfilled' && r.value.success
        ? r.value.data
        : { error: r.status === 'rejected' ? String(r.reason) : (r.value as ApiResponse).error };

    return {
      success: true,
      data: {
        prefectureCode: params.prefectureCode,
        health: extract(healthResult),
        population: extract(populationResult),
        macro: extract(macroResult),
      },
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return createError(source, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 労働市場 需給分析
 * ハローワーク求人 + e-Stat労働力調査
 */
export async function laborDemandSupply(params: {
  prefectureCode: string;
  occupation?: string;
  appId?: string;
}): Promise<ApiResponse<unknown>> {
  const source = 'Scenario/labor_demand_supply';

  if (!params.prefectureCode?.trim()) {
    return createError(source, 'prefectureCode is required');
  }

  try {
    const helloworkKey = process.env.HELLOWORK_API_KEY || '';
    const estatAppId = params.appId || process.env.ESTAT_APP_ID || '';

    const [jobsResult, laborResult] = await Promise.allSettled([
      // ハローワーク求人
      helloworkKey
        ? searchJobs({ apiKey: helloworkKey } as HelloworkConfig, {
            prefCode: params.prefectureCode,
            keyword: params.occupation,
          })
        : Promise.resolve(createError(source, 'HELLOWORK_API_KEY is not set')),
      // 統計ダッシュボード: 完全失業率
      getDashboardData({
        indicatorCode: 'D3101',
        regionCode: params.prefectureCode,
      }),
    ]);

    const extract = (r: PromiseSettledResult<ApiResponse>) =>
      r.status === 'fulfilled' && r.value.success
        ? r.value.data
        : { error: r.status === 'rejected' ? String(r.reason) : (r.value as ApiResponse).error };

    return {
      success: true,
      data: {
        prefectureCode: params.prefectureCode,
        occupation: params.occupation,
        jobs: extract(jobsResult),
        labor: extract(laborResult),
      },
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return createError(source, error instanceof Error ? error.message : String(error));
  }
}
