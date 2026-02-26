/**
 * ミラサポplus API Provider (中小企業庁)
 * 中小企業の成功事例・支援施策検索
 * https://mirasapo-plus.go.jp/
 * APIキー不要
 */

import { fetchJson, buildUrl, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://mirasapo-plus.go.jp/jirei-api';

/** 成功事例検索 */
export async function searchCaseStudies(params: {
  keywords?: string;
  prefecture?: string;
  industryCategory?: string;
  purposeCategory?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse> {
  const url = buildUrl(`${BASE_URL}/case_studies`, {
    keywords: params.keywords,
    prefecture: params.prefecture,
    industry_category: params.industryCategory,
    purpose_category: params.purposeCategory,
    sort: params.sort,
    order: params.order,
    limit: params.limit || 10,
    offset: params.offset || 0,
  });
  return fetchJson(url, {
    source: 'ミラサポplus/search',
    cacheTtl: CacheTTL.SEARCH,
  });
}

/** 事例詳細取得 */
export async function getCaseStudy(params: {
  id: string;
}): Promise<ApiResponse> {
  return fetchJson(`${BASE_URL}/case_studies/${params.id}`, {
    source: 'ミラサポplus/detail',
    cacheTtl: CacheTTL.DATA,
  });
}

/** カテゴリマスタ取得 */
export async function getCategories(params: {
  type: 'industries' | 'purposes' | 'services' | 'specific_measures';
}): Promise<ApiResponse> {
  return fetchJson(`${BASE_URL}/categories/${params.type}`, {
    source: `ミラサポplus/categories/${params.type}`,
    cacheTtl: CacheTTL.MASTER,
  });
}

/** 地方区分・都道府県マスタ取得 */
export async function getRegions(): Promise<ApiResponse> {
  return fetchJson(`${BASE_URL}/regions`, {
    source: 'ミラサポplus/regions',
    cacheTtl: CacheTTL.MASTER,
  });
}
