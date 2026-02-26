/**
 * 官公需情報ポータル API Provider
 * 中小企業庁 - 入札・調達案件検索
 * https://www.kkj.go.jp/
 * APIキー不要 (XML/RSS)
 */

import { fetchXml, buildUrl, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://www.kkj.go.jp/api/search';

/** 官公需情報 入札・調達案件検索 */
export async function searchKkj(params: {
  Query?: string;
  Project_Name?: string;
  Organization_Name?: string;
  CFT_Issue_Date?: string;
  Tender_Submission_Deadline?: string;
  Area?: string;
  Count?: number;
  Start?: number;
}): Promise<ApiResponse<string>> {
  const url = buildUrl(BASE_URL, {
    Query: params.Query,
    Project_Name: params.Project_Name,
    Organization_Name: params.Organization_Name,
    CFT_Issue_Date: params.CFT_Issue_Date,
    Tender_Submission_Deadline: params.Tender_Submission_Deadline,
    Area: params.Area,
    Count: params.Count || 20,
    Start: params.Start || 1,
  });
  return fetchXml(url, {
    source: '官公需情報ポータル/search',
    cacheTtl: CacheTTL.SEARCH,
    timeout: 60000, // 長めのタイムアウト
  });
}
