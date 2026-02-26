/**
 * パブリックコメント API Provider
 * e-Gov パブリックコメント RSS
 * https://public-comment.e-gov.go.jp/
 * APIキー不要
 */

import { fetchXml, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://public-comment.e-gov.go.jp/rss';

/** パブリックコメント取得 (RSS) */
export async function getPublicComments(params?: {
  type?: 'list' | 'result';  // list=意見募集中 result=結果公示
}): Promise<ApiResponse<string>> {
  const pcType = params?.type || 'list';
  const url = pcType === 'result'
    ? `${BASE_URL}/pcm_result.xml`
    : `${BASE_URL}/pcm_list.xml`;
  return fetchXml(url, {
    source: `パブコメ/${pcType}`,
    cacheTtl: CacheTTL.SEARCH,
  });
}
