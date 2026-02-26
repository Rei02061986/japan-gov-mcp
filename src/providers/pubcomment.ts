/**
 * パブリックコメント API Provider
 * e-Gov パブリックコメント RSS
 * https://public-comment.e-gov.go.jp/
 * APIキー不要
 */

import { fetchXml, buildUrl, CacheTTL } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';

const BASE_URL = 'https://public-comment.e-gov.go.jp/servlet/PcmFileDownload';

/** パブリックコメント取得 */
export async function getPublicComments(params?: {
  type?: 'list' | 'result';  // list=意見募集中 result=結果公示
  categoryCode?: string;      // カテゴリコード10桁
}): Promise<ApiResponse<string>> {
  const pcType = params?.type || 'list';
  const url = buildUrl(BASE_URL, {
    seqNo: pcType === 'result' ? '0000000002' : '0000000001',
    categoryCode: params?.categoryCode,
  });
  return fetchXml(url, {
    source: `パブコメ/${pcType}`,
    cacheTtl: CacheTTL.SEARCH,
  });
}
