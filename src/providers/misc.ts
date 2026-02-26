/**
 * その他のAPI Provider群
 * APIキー不要のものを中心に、小規模Providerをまとめて管理
 */

import { fetchJson, fetchXml, buildUrl, createError, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

// ═══════════════════════════════════════════════
// 法令API V2 (デジタル庁/e-Gov) - APIキー不要
// https://laws.e-gov.go.jp/docs/api/
// ═══════════════════════════════════════════════

const ELAWS_BASE = 'https://laws.e-gov.go.jp/api/2';

export interface ELawsResponse {
  [key: string]: unknown;
}

/** 法令一覧取得 */
export async function searchLaws(params: {
  category?: number;  // 1:憲法 2:法律 3:政令 4:勅令 5:府省令 6:規則
  offset?: number;
  limit?: number;
}): Promise<ApiResponse<ELawsResponse>> {
  const cat = params.category ?? 2;
  if (!Number.isInteger(cat) || cat < 1 || cat > 6) {
    return createError('法令API/laws', 'category must be an integer between 1 and 6');
  }
  const url = buildUrl(`${ELAWS_BASE}/laws`, {
    category: cat,
    offset: params.offset ?? 0,
    limit: params.limit ?? 20,
  });
  return fetchJson<ELawsResponse>(url, { source: '法令API/laws' });
}

/** 法令本文取得 */
export async function getLawData(params: {
  lawId?: string;
  lawRevisionId?: string;
}): Promise<ApiResponse<ELawsResponse>> {
  const id = params.lawId || params.lawRevisionId;
  if (!id?.trim()) {
    return createError('法令API/fulltext', 'lawId is required');
  }
  return fetchJson<ELawsResponse>(`${ELAWS_BASE}/law_data/${id}`, {
    source: '法令API/fulltext',
  });
}

/** 法令キーワード検索 */
export async function searchLawsByKeyword(params: {
  keyword: string;
  offset?: number;
  limit?: number;
}): Promise<ApiResponse<ELawsResponse>> {
  if (!params.keyword?.trim()) {
    return createError('法令API/laws', 'keyword is required');
  }
  const url = buildUrl(`${ELAWS_BASE}/laws`, {
    keyword: params.keyword,
    offset: params.offset ?? 0,
    limit: params.limit ?? 20,
  });
  return fetchJson<ELawsResponse>(url, { source: '法令API/laws' });
}

// ═══════════════════════════════════════════════
// 統計ダッシュボード WebAPI (総務省) - APIキー不要
// https://dashboard.e-stat.go.jp/static/api
// ═══════════════════════════════════════════════

const DASHBOARD_BASE = 'https://dashboard.e-stat.go.jp/api/1.0';

/** WAF/CDNがUser-Agentなしのリクエストをブロックするため、ブラウザ風ヘッダーを付与 */
const DASHBOARD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export interface DashboardResponse {
  GET_INDICATOR_INFO?: Record<string, unknown>;
  GET_STATS_DATA?: Record<string, unknown>;
  RESULT?: { STATUS: number; ERROR_MSG?: string; DATE?: string };
  [key: string]: unknown;
}

/** 統計指標情報取得 */
export async function getDashboardIndicators(params: {
  indicatorCode?: string;
  lang?: string;
}): Promise<ApiResponse<DashboardResponse>> {
  const url = buildUrl(`${DASHBOARD_BASE}/Json/getIndicatorInfo`, {
    Lang: params.lang || 'JP',
    IndicatorCode: params.indicatorCode,
    MetaGetFlg: 'Y',
    IsSeasonalAdjustment: '1',
  });
  return fetchJson<DashboardResponse>(url, {
    source: '統計ダッシュボード/indicatorInfo',
    headers: DASHBOARD_HEADERS,
  });
}

/** 統計データ取得 */
export async function getDashboardData(params: {
  indicatorCode: string;
  regionCode?: string;
  timeCdFrom?: string;
  timeCdTo?: string;
  lang?: string;
}): Promise<ApiResponse<DashboardResponse>> {
  if (!params.indicatorCode?.trim()) {
    return createError('統計ダッシュボード/statsData', 'indicatorCode is required');
  }
  const url = buildUrl(`${DASHBOARD_BASE}/Json/getStatsData`, {
    Lang: params.lang || 'JP',
    IndicatorCode: params.indicatorCode,
    RegionCode: params.regionCode,
    TimeCdFrom: params.timeCdFrom,
    TimeCdTo: params.timeCdTo,
    MetaGetFlg: 'Y',
  });
  return fetchJson<DashboardResponse>(url, {
    source: '統計ダッシュボード/statsData',
    headers: DASHBOARD_HEADERS,
  });
}

// ═══════════════════════════════════════════════
// 不動産情報ライブラリAPI (国土交通省)
// https://www.reinfolib.mlit.go.jp/
// ═══════════════════════════════════════════════

const FUDOUSAN_BASE = 'https://www.reinfolib.mlit.go.jp/ex-api/external';

export interface RealEstateConfig {
  apiKey: string;
}

export interface RealEstateResponse {
  status?: string;
  data?: unknown[];
  [key: string]: unknown;
}

/** 不動産取引価格情報 */
export async function getRealEstateTransactions(config: RealEstateConfig, params: {
  year: string;
  quarter: string;
  area?: string;
  city?: string;
}): Promise<ApiResponse<RealEstateResponse>> {
  if (!params.year?.trim() || !params.quarter?.trim()) {
    return createError('不動産情報ライブラリ/transactions', 'year and quarter are required');
  }
  const url = buildUrl(`${FUDOUSAN_BASE}/XIT001`, {
    from: params.year, to: params.quarter,
    area: params.area, city: params.city,
  });
  return fetchJson<RealEstateResponse>(url, {
    source: '不動産情報ライブラリ/transactions',
    headers: { 'Ocp-Apim-Subscription-Key': config.apiKey },
  });
}

/** 地価公示・地価調査 */
export async function getLandPrice(config: RealEstateConfig, params: {
  year: string;
  area?: string;
  city?: string;
}): Promise<ApiResponse<RealEstateResponse>> {
  if (!params.year?.trim()) {
    return createError('不動産情報ライブラリ/landPrice', 'year is required');
  }
  const url = buildUrl(`${FUDOUSAN_BASE}/XIT002`, {
    year: params.year, area: params.area, city: params.city,
  });
  return fetchJson<RealEstateResponse>(url, {
    source: '不動産情報ライブラリ/landPrice',
    headers: { 'Ocp-Apim-Subscription-Key': config.apiKey },
  });
}

// ═══════════════════════════════════════════════
// データカタログサイトAPI (デジタル庁) - APIキー不要
// https://www.data.go.jp/ (CKAN API)
// ═══════════════════════════════════════════════

const DATACATALOG_BASE = 'https://www.data.go.jp/data/api/3';

export interface CkanResponse {
  help?: string;
  success?: boolean;
  result?: unknown;
  error?: { message?: string; __type?: string };
  [key: string]: unknown;
}

/** データセット検索 */
export async function searchDatasets(params: {
  q?: string;
  fq?: string;
  rows?: number;
  start?: number;
  sort?: string;
}): Promise<ApiResponse<CkanResponse>> {
  const url = buildUrl(`${DATACATALOG_BASE}/action/package_search`, {
    q: params.q, fq: params.fq,
    rows: params.rows || 20, start: params.start || 0,
    sort: params.sort,
  });
  return fetchJson<CkanResponse>(url, { source: 'データカタログ/search' });
}

/** データセット詳細 */
export async function getDatasetDetail(params: { id: string }): Promise<ApiResponse<CkanResponse>> {
  if (!params.id?.trim()) {
    return createError('データカタログ/detail', 'id is required');
  }
  const url = buildUrl(`${DATACATALOG_BASE}/action/package_show`, { id: params.id });
  return fetchJson<CkanResponse>(url, { source: 'データカタログ/detail' });
}

/** 組織一覧 */
export async function listOrganizations(): Promise<ApiResponse<CkanResponse>> {
  return fetchJson<CkanResponse>(`${DATACATALOG_BASE}/action/organization_list?all_fields=true`, {
    source: 'データカタログ/organizations',
    cacheTtl: CacheTTL.MASTER,
  });
}

// ═══════════════════════════════════════════════
// 海外安全情報オープンデータ (外務省) - APIキー不要
// https://www.ezairyu.mofa.go.jp/html/opendata/index.html
// ═══════════════════════════════════════════════

const ANZEN_BASE = 'https://www.ezairyu.mofa.go.jp/opendata';

export interface SafetyInfoResponse {
  [key: string]: unknown;
}

/** 海外安全情報取得 (XML) */
export async function getSafetyInfo(params: {
  regionCode?: string;
  countryCode?: string;
}): Promise<ApiResponse<string>> {
  const url = params.countryCode
    ? `${ANZEN_BASE}/country/${params.countryCode}.xml`
    : params.regionCode
      ? `${ANZEN_BASE}/area/${params.regionCode}.xml`
      : `${ANZEN_BASE}/area/newarrival.xml`;
  return fetchXml(url, {
    source: '海外安全情報',
    cacheTtl: params.countryCode || params.regionCode ? CacheTTL.DATA : CacheTTL.MASTER,
  });
}

// ═══════════════════════════════════════════════
// 求人情報webAPI (厚生労働省/ハローワーク) - APIキー必要
// ═══════════════════════════════════════════════

const HELLOWORK_BASE = 'https://api.hellowork.mhlw.go.jp/gateway/v1';

export interface HelloworkConfig {
  apiKey: string;
}

/** 求人情報検索 */
export async function searchJobs(config: HelloworkConfig, params: {
  keyword?: string;
  prefCode?: string;
  occupation?: string;
  employment?: string;
  page?: number;
}): Promise<ApiResponse> {
  if (!config.apiKey?.trim()) {
    return createError('ハローワーク/offers', 'ハローワーク API key is required');
  }
  const url = buildUrl(`${HELLOWORK_BASE}/offers`, {
    keyword: params.keyword, prefCode: params.prefCode,
    occupation: params.occupation, employment: params.employment,
    page: params.page || 1,
  });
  return fetchJson(url, { headers: { 'X-API-KEY': config.apiKey }, source: 'ハローワーク/offers' });
}

// ═══════════════════════════════════════════════
// AgriKnowledge (農研機構) - APIキー不要
// ═══════════════════════════════════════════════

const AGRI_BASE = 'https://agriknowledge.affrc.go.jp/api';

/** 農業技術・試験研究成果を検索 (OpenSearch XML) */
export async function searchAgriKnowledge(params: {
  query: string;
  count?: number;
}): Promise<ApiResponse<string>> {
  if (!params.query?.trim()) {
    return createError('AgriKnowledge/search', 'query is required');
  }
  const url = buildUrl(`${AGRI_BASE}/opensearch`, {
    q: params.query,
    cnt: params.count || 20,
  });
  return fetchXml(url, {
    source: 'AgriKnowledge/search',
    cacheTtl: CacheTTL.SEARCH,
  });
}
