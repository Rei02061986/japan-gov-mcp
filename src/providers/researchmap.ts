/**
 * researchmap API Provider (JST)
 * 研究者の業績情報取得
 * https://researchmap.jp/
 * APIキー不要
 */

import { fetchJson, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://api.researchmap.jp';

/** 研究者の業績情報取得 */
export async function getResearcherAchievements(params: {
  permalink: string;
  achievementType: string;
  limit?: number;
  start?: number;
}): Promise<ApiResponse> {
  if (!params.permalink?.trim()) {
    return createError('researchmap/achievements', 'permalink is required');
  }
  if (!params.achievementType?.trim()) {
    return createError('researchmap/achievements', 'achievementType is required');
  }
  const url = buildUrl(`${BASE_URL}/${params.permalink}/${params.achievementType}`, {
    limit: params.limit || 20,
    start: params.start || 1,
    format: 'json',
  });
  return fetchJson(url, {
    source: 'researchmap/achievements',
    cacheTtl: CacheTTL.SEARCH,
  });
}
